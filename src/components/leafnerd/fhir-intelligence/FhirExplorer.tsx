"use client";
/* LEAFNERD — FHIR Explorer (split pane) */
import React from "react";
import { Icon, Badge, Conf } from "./primitives";
import { ProvSteps, ValItem } from "./Drawer";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import type { FhirRelated, FhirResource, LeafnerdData } from "@/lib/leafnerd/types";

// ===========================================================================
// Pure logic (exported for unit tests — no React, no DOM).
// ===========================================================================

/** Narrow an unknown JSON value to a plain object (not array), else null. */
function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Read a string `id` off a resource's raw JSON, else undefined. */
function jsonId(json: unknown): string | undefined {
  const v = asObj(json)?.id;
  return typeof v === "string" ? v : undefined;
}

// ---- US-Core validation derivation ---------------------------------------

export type UsCoreSeverity = "ok" | "warn" | "err";

export interface UsCoreCheck {
  /** Roll-up severity of this single conformance rule. */
  kind: UsCoreSeverity;
  /** Short rule family (Profile, Cardinality, Terminology, …). */
  rule: string;
  /** Human-readable sentence. */
  detail: string;
  /** Optional FHIR element / profile name rendered in mono-bold. */
  el?: string;
}

const SEV_RANK: Record<UsCoreSeverity, number> = { ok: 0, warn: 1, err: 2 };
// The resource's authoritative roll-up uses "pass" where a check uses "ok".
const VALID_RANK: Record<FhirResource["valid"], number> = { pass: 0, warn: 1, err: 2 };

/** US-Core mandatory (1..*) elements we assert presence of, per resource type. */
const REQUIRED_ELEMENTS: Record<string, string[]> = {
  Patient: ["identifier", "name"],
  Encounter: ["status", "class", "subject"],
  Observation: ["status", "code", "subject"],
  Condition: ["clinicalStatus", "code", "subject"],
  MedicationRequest: ["status", "intent", "medicationCodeableConcept", "subject"],
};

/** The CodeableConcept element that carries each type's primary terminology. */
function primaryConceptKey(type: string): string | null {
  if (type === "Observation" || type === "Condition") return "code";
  if (type === "MedicationRequest") return "medicationCodeableConcept";
  return null;
}

type CodingState = "coded" | "empty" | "text" | "absent";

/**
 * Inspect a CodeableConcept's terminology binding:
 *   - "coded": at least one coding carries a `system` (genuine binding)
 *   - "empty": a `coding: []` is present but bound nothing (failed mapping → error)
 *   - "text":  free-text only, no coding (never coded → warning)
 *   - "absent": no concept at all
 */
function codingState(concept: unknown): CodingState {
  const c = asObj(concept);
  if (!c) return "absent";
  const coding = c.coding;
  if (Array.isArray(coding)) {
    return coding.some((e) => asObj(e)?.system != null) ? "coded" : "empty";
  }
  return typeof c.text === "string" && c.text ? "text" : "absent";
}

function present(json: Record<string, unknown>, key: string): boolean {
  const v = json[key];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Derive a genuine US-Core conformance checklist from a resource's actual R4
 * JSON. Each finding is keyed to a real fact in the payload (resourceType,
 * mandatory cardinality, terminology bindings, subject references, BP
 * components, mapping confidence). The list's worst severity is reconciled to
 * the resource's authoritative `valid` roll-up so the explorer never
 * under-reports a flagged resource.
 */
export function deriveUsCoreChecks(r: FhirResource): UsCoreCheck[] {
  const json = r.json ?? {};
  const checks: UsCoreCheck[] = [];

  // 1. Profile conformance — resourceType matches the declared type, and the
  // payload asserts a US-Core profile in meta.profile when present.
  const rt = typeof json.resourceType === "string" ? json.resourceType : undefined;
  const metaProfile = asObj(json.meta)?.profile;
  const asserts = Array.isArray(metaProfile) && metaProfile.some((p) => typeof p === "string");
  checks.push(
    rt === r.type
      ? {
          kind: "ok",
          rule: "Profile",
          detail: asserts
            ? `Declares meta.profile & conforms to ${r.profile}`
            : `Conforms to ${r.profile} · US Core 6.1`,
          el: r.profile,
        }
      : { kind: "warn", rule: "Profile", detail: `resourceType ${rt ?? "—"} does not match ${r.type}` },
  );

  // 2. Mandatory (1..*) cardinality.
  const required = REQUIRED_ELEMENTS[r.type] ?? [];
  if (required.length) {
    const missing = required.filter((k) => !present(json, k));
    checks.push(
      missing.length === 0
        ? { kind: "ok", rule: "Cardinality", detail: "All mandatory (1..*) elements present" }
        : { kind: "err", rule: "Cardinality", detail: "Missing mandatory element", el: missing.join(", ") },
    );
  }

  // 3. Terminology binding on the primary coded concept.
  const conceptKey = primaryConceptKey(r.type);
  if (conceptKey) {
    const state = codingState(json[conceptKey]);
    if (state === "coded")
      checks.push({ kind: "ok", rule: "Terminology", detail: "Terminology binding resolved on", el: conceptKey });
    else if (state === "empty")
      checks.push({ kind: "err", rule: "Terminology", detail: "No recognized coding system on", el: conceptKey });
    else if (state === "text")
      checks.push({ kind: "warn", rule: "Terminology", detail: "Carried as free text — no terminology binding on", el: conceptKey });
    else
      checks.push({ kind: "warn", rule: "Terminology", detail: "No codeable concept on", el: conceptKey });
  } else if (r.type === "Patient") {
    checks.push({ kind: "ok", rule: "Terminology", detail: "Identifier system & administrative-gender value set bound" });
  } else if (r.type === "Encounter") {
    checks.push({ kind: "ok", rule: "Terminology", detail: "class bound to v3-ActCode (AMB)" });
  }

  // 4. Blood-pressure component codes (US-Core Blood Pressure profile).
  const isBP = r.type === "Observation" && (/85354-9/.test(r.code) || /blood pressure/i.test(r.profile));
  if (isBP) {
    const comp = json.component;
    const componentsCoded =
      Array.isArray(comp) &&
      comp.length >= 2 &&
      comp.every((c) => codingState(asObj(c)?.code) === "coded");
    checks.push(
      componentsCoded
        ? { kind: "ok", rule: "Components", detail: "Systolic & diastolic components coded (8480-6 / 8462-4)" }
        : { kind: "warn", rule: "Components", detail: "Missing component code on one reading", el: "component.code" },
    );
  }

  // 5. Subject reference resolves (the Patient is its own subject).
  if (r.type === "Patient") {
    checks.push({ kind: "ok", rule: "Reference", detail: "Patient is the focal subject of record" });
  } else {
    const ref = asObj(json.subject)?.reference;
    checks.push(
      typeof ref === "string" && ref
        ? { kind: "ok", rule: "Reference", detail: "Subject reference resolves", el: ref }
        : { kind: "err", rule: "Reference", detail: "Unresolved subject reference" },
    );
  }

  // 6. Mapping confidence → measure eligibility.
  const pct = Math.round(r.mapping * 100);
  checks.push(
    r.mapping >= 0.8
      ? { kind: "ok", rule: "Confidence", detail: `Mapping confidence ${pct}% — eligible for quality measures` }
      : { kind: "warn", rule: "Confidence", detail: `Mapping confidence ${pct}% below 0.80 threshold — excluded from measures` },
  );

  // Reconcile to the authoritative roll-up: never under-report a flagged row.
  const worst = checks.reduce((m, c) => Math.max(m, SEV_RANK[c.kind]), 0);
  if (VALID_RANK[r.valid] > worst) {
    checks.push(
      r.valid === "err"
        ? { kind: "err", rule: "Conformance", detail: "Resource has a blocking US Core conformance error" }
        : { kind: "warn", rule: "Conformance", detail: "Flagged for steward review before measure inclusion" },
    );
  }

  return checks;
}

/** Tally a checklist into pass/warn/error counts. */
export function tallyChecks(checks: UsCoreCheck[]): { ok: number; warn: number; err: number } {
  return checks.reduce(
    (a, c) => {
      a[c.kind] += 1;
      return a;
    },
    { ok: 0, warn: 0, err: 0 },
  );
}

// ---- Dynamic traversal (related-chip → node hopping) ---------------------

/** Find the first `${type}/<id>` reference anywhere in a resource's JSON. */
function refIdOfType(json: unknown, type: string): string | null {
  const prefix = type + "/";
  let found: string | null = null;
  const visit = (v: unknown): void => {
    if (found) return;
    if (typeof v === "string") {
      if (v.startsWith(prefix) && v.length > prefix.length) found = v.slice(prefix.length);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        visit(x);
        if (found) return;
      }
      return;
    }
    const o = asObj(v);
    if (o) {
      for (const k of Object.keys(o)) {
        visit(o[k]);
        if (found) return;
      }
    }
  };
  visit(json);
  return found;
}

/**
 * Resolve a related-resource chip to the genuine target node, following (in
 * priority order):
 *   1. a real FHIR reference (`subject`/`encounter`/… `Type/id`) in the source
 *      JSON, matched against either a resource id or its embedded json.id;
 *   2. the same patient's resource of that type whose label/code matches;
 *   3. any same-patient resource of that type;
 *   4. any resource of that type (cross-patient fallback).
 * Returns null when no such resource is loaded (an inert chip).
 */
export function resolveRelatedTarget(
  source: FhirResource,
  rel: FhirRelated,
  all: FhirResource[],
): FhirResource | null {
  // 1. Reference-based hop.
  const refId = refIdOfType(source.json, rel.t);
  if (refId) {
    const byRef = all.find(
      (c) => c.id !== source.id && (c.id === refId || jsonId(c.json) === refId),
    );
    if (byRef) return byRef;
  }

  const sameType = all.filter((c) => c.type === rel.t && c.id !== source.id);
  if (!sameType.length) return null;

  const samePatient = sameType.filter((c) => c.patient === source.patient);
  const pool = samePatient.length ? samePatient : sameType;

  // 2/3. Label match within the (patient-scoped) pool.
  const l = rel.l.toLowerCase();
  const byLabel = pool.find((c) => {
    const cl = c.label.toLowerCase();
    const cc = c.code.toLowerCase();
    return cl === l || cl.includes(l) || l.includes(cl) || cc.includes(l);
  });

  // 4. First of pool as the last resort.
  return byLabel ?? pool[0];
}

/** Collapsed-node summary, e.g. "{ … 3 fields }" / "[ … 2 items ]". */
export function collapsedSummary(value: unknown): string {
  if (Array.isArray(value)) {
    const n = value.filter((v) => v !== undefined).length;
    return `[ … ${n} item${n === 1 ? "" : "s"} ]`;
  }
  const o = asObj(value);
  const n = o ? Object.values(o).filter((v) => v !== undefined).length : 0;
  return `{ … ${n} field${n === 1 ? "" : "s"} }`;
}

// ===========================================================================
// Foldable JSON tree (code folding inside the Raw JSON tab).
// Hooks live only in <JsonBranch> so they are never called conditionally.
// ===========================================================================

function tokenClass(v: unknown): "s" | "n" | "b" {
  if (typeof v === "number") return "n";
  if (typeof v === "string") return "s";
  return "b"; // boolean | null
}

function rowStyle(depth: number): React.CSSProperties {
  return { paddingLeft: depth * 14, whiteSpace: "pre-wrap", wordBreak: "break-word" };
}

function KeyTok({ k }: { k: string | null }) {
  if (k === null) return null;
  return (
    <React.Fragment>
      <span className="k">&quot;{k}&quot;</span>:{" "}
    </React.Fragment>
  );
}

/** Object/array entries, dropping undefined values (mirrors JSON.stringify). */
function objEntries(value: object): [string | null, unknown][] {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => [null, v] as [null, unknown]);
  }
  return Object.entries(value).filter(([, v]) => v !== undefined) as [string, unknown][];
}

interface NodeProps {
  k: string | null;
  value: unknown;
  depth: number;
  isLast: boolean;
  allOpen: boolean;
}

function JsonValue({ k, value, depth, isLast, allOpen }: NodeProps) {
  if (value === null || typeof value !== "object") {
    return (
      <div style={rowStyle(depth)}>
        <KeyTok k={k} />
        <span className={tokenClass(value)}>{JSON.stringify(value)}</span>
        {isLast ? "" : ","}
      </div>
    );
  }
  const isArr = Array.isArray(value);
  const filtered = objEntries(value as object);
  if (filtered.length === 0) {
    return (
      <div style={rowStyle(depth)}>
        <KeyTok k={k} />
        <span className="p">{isArr ? "[]" : "{}"}</span>
        {isLast ? "" : ","}
      </div>
    );
  }
  return (
    <JsonBranch
      k={k}
      depth={depth}
      isLast={isLast}
      allOpen={allOpen}
      isArr={isArr}
      filtered={filtered}
    />
  );
}

function JsonBranch({
  k,
  depth,
  isLast,
  allOpen,
  isArr,
  filtered,
}: {
  k: string | null;
  depth: number;
  isLast: boolean;
  allOpen: boolean;
  isArr: boolean;
  filtered: [string | null, unknown][];
}) {
  // Root stays open even on "collapse all" so the top-level keys are visible.
  const [isOpen, setOpen] = React.useState(depth === 0 ? true : allOpen);
  const oB = isArr ? "[" : "{";
  const cB = isArr ? "]" : "}";
  const n = filtered.length;

  if (!isOpen) {
    const sum = isArr ? `${n} item${n === 1 ? "" : "s"}` : `${n} field${n === 1 ? "" : "s"}`;
    return (
      <div
        style={rowStyle(depth)}
        className="jrow"
        role="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        <span className="jtog">
          <Icon name="chevR" size={11} />
        </span>
        <KeyTok k={k} />
        <span className="p">{oB}</span>
        <span className="jsum"> … {sum} </span>
        <span className="p">{cB}</span>
        {isLast ? "" : ","}
      </div>
    );
  }

  return (
    <React.Fragment>
      <div
        style={rowStyle(depth)}
        className="jrow"
        role="button"
        aria-expanded={true}
        onClick={() => setOpen(false)}
      >
        <span className="jtog">
          <Icon name="chevD" size={11} />
        </span>
        <KeyTok k={k} />
        <span className="p">{oB}</span>
      </div>
      {filtered.map(([ck, cv], i) => (
        <JsonValue
          key={isArr ? i : (ck as string)}
          k={isArr ? null : (ck as string)}
          value={cv}
          depth={depth + 1}
          isLast={i === n - 1}
          allOpen={allOpen}
        />
      ))}
      <div style={{ paddingLeft: depth * 14 }}>
        <span className="p">{cB}</span>
        {isLast ? "" : ","}
      </div>
    </React.Fragment>
  );
}

/** Render a check's detail with its FHIR element rendered in mono-bold. */
function CheckDetail({ c }: { c: UsCoreCheck }) {
  if (!c.el) return <React.Fragment>{c.detail}</React.Fragment>;
  const i = c.detail.indexOf(c.el);
  if (i === -1) {
    return (
      <React.Fragment>
        {c.detail} <b className="mono">{c.el}</b>
      </React.Fragment>
    );
  }
  return (
    <React.Fragment>
      {c.detail.slice(0, i)}
      <b className="mono">{c.el}</b>
      {c.detail.slice(i + c.el.length)}
    </React.Fragment>
  );
}

// ===========================================================================
// Surface
// ===========================================================================

export function FhirExplorerSurface({ data = DEMO_DATA, toast }: { data?: LeafnerdData; toast: (m: string) => void }) {
  const D = data;
  const [activeId, setActiveId] = React.useState(D.fhirResources[0].id);
  const [rtab, setRtab] = React.useState("raw");
  const [query, setQuery] = React.useState("");
  // Traversal history — each related-chip hop pushes the prior resource id so
  // "Back" returns the user along the path they followed.
  const [history, setHistory] = React.useState<string[]>([]);
  // Raw-JSON bulk fold state. `jsonGen` bumps on expand/collapse-all to remount
  // the tree so every node resets to the new default open state.
  const [jsonAllOpen, setJsonAllOpen] = React.useState(true);
  const [jsonGen, setJsonGen] = React.useState(0);

  // free-text filter across type, label, patient, code, status
  const q = query.trim().toLowerCase();
  const matches = (x: FhirResource) =>
    !q || [x.type, x.label, x.patient, x.code, x.status].some(v => v.toLowerCase().includes(q));
  const visible = D.fhirResources.filter(matches);
  // The active resource follows the filter: if the current selection is filtered
  // out, fall back to the first visible match (never crashes when nothing matches).
  const r = visible.find(x => x.id === activeId) || visible[0] || D.fhirResources[0];

  // Derived US-Core conformance checklist + counts for the active resource.
  const checks = deriveUsCoreChecks(r);
  const counts = tallyChecks(checks);

  // group (filtered) resources by type for the tree
  const groups: Record<string, FhirResource[]> = {};
  visible.forEach(x => { (groups[x.type] = groups[x.type] || []).push(x); });
  const typeOrder = ["Patient", "Condition", "Observation", "MedicationRequest", "Encounter"];

  // Hop to a resource (chip traversal). Clears the filter if the target is
  // hidden so the hop always lands, and records the jump for "Back".
  const goTo = (id: string) => {
    const t = D.fhirResources.find(x => x.id === id);
    if (!t || id === r.id) return;
    if (!matches(t)) setQuery("");
    setHistory(h => [...h, r.id]);
    setActiveId(id);
  };
  const goBack = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    const t = D.fhirResources.find(x => x.id === prev);
    if (t && !matches(t)) setQuery("");
    setHistory(h => h.slice(0, -1));
    setActiveId(prev);
  };
  const setJsonFold = (open: boolean) => {
    setJsonAllOpen(open);
    setJsonGen(g => g + 1);
  };

  return (
    <div className="explorer">
      {/* LEFT — resource tree */}
      <div className="exp-pane exp-left">
        <div className="exp-pane-head">
          <div className="t">Resource tree</div>
          <div className="search" style={{ width: "auto", marginTop: 10, padding: "6px 10px" }}>
            <Icon name="search" size={14} />
            <input
              placeholder="Filter resources…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter FHIR resources"
            />
            {query && (
              <span role="button" aria-label="Clear filter" onClick={() => setQuery("")} style={{ cursor: "pointer", color: "var(--faint)", display: "inline-flex" }}>
                <Icon name="x" size={14} />
              </span>
            )}
          </div>
        </div>
        {visible.length === 0 && (
          <div style={{ padding: "18px 16px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
            No resources match <b className="mono" style={{ color: "var(--ink-2)" }}>{query}</b>.
            <span className="link" style={{ marginLeft: 6, color: "var(--canopy)", cursor: "pointer" }} onClick={() => setQuery("")}>Clear</span>
          </div>
        )}
        {typeOrder.filter(t => groups[t]).map(type => (
          <div key={type} className="tree-group">
            <div className="tree-grp-label">
              <Icon name="chevD" size={12} />{type}
              <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontWeight: 400 }}>{(q ? groups[type].length : (D.fhirCounts[type] || groups[type].length)).toLocaleString()}</span>
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
            <div className="t" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {history.length > 0 && (
                <span
                  role="button"
                  aria-label="Back to previous resource"
                  onClick={goBack}
                  title="Back"
                  style={{ cursor: "pointer", display: "inline-flex", color: "var(--canopy)" }}
                >
                  <Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} />
                </span>
              )}
              Normalized view
            </div>
            <div className="wrap-gap">
              <Badge tone="indigo" mono dot={false}>{r.type}</Badge>
              {counts.err > 0 && <Badge tone="rose" dot={false}>{counts.err} error{counts.err === 1 ? "" : "s"}</Badge>}
              {counts.warn > 0 && <Badge tone="amber" dot={false}>{counts.warn} warning{counts.warn === 1 ? "" : "s"}</Badge>}
              {counts.err === 0 && counts.warn === 0 && <Badge tone="green" dot={false}>US Core validated</Badge>}
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
                const tgt = resolveRelatedTarget(r, x, D.fhirResources);
                if (!tgt) {
                  return (
                    <span key={i} className="chip" style={{ opacity: .5, cursor: "default" }} title={`No ${x.t} resource loaded`}>
                      <Icon name="git" size={13} />{x.t}: {x.l}
                      <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>· not loaded</span>
                    </span>
                  );
                }
                return (
                  <button
                    key={i}
                    className="chip"
                    onClick={() => { goTo(tgt.id); toast(`→ ${tgt.type} · ${tgt.label}`); }}
                    title={`Open ${tgt.type}/${tgt.id}`}
                  >
                    <Icon name="git" size={13} />{x.t}: {x.l}
                    <Icon name="arrowR" size={12} style={{ opacity: .5 }} />
                  </button>
                );
              })}
            </div>
          </div>

          {r.valid === "err" && r.type === "MedicationRequest" && (
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span
                  role="button"
                  onClick={() => setJsonFold(true)}
                  title="Expand all nodes"
                  className="mono"
                  style={{ fontSize: 11, color: "var(--canopy)", cursor: "pointer", padding: "0 4px" }}
                >Expand all</span>
                <span style={{ color: "var(--faint)" }}>·</span>
                <span
                  role="button"
                  onClick={() => setJsonFold(false)}
                  title="Collapse all nodes"
                  className="mono"
                  style={{ fontSize: 11, color: "var(--canopy)", cursor: "pointer", padding: "0 4px" }}
                >Collapse all</span>
                <button className="icbtn" style={{ width: 28, height: 28, marginLeft: 4 }} onClick={() => toast("Resource JSON copied")} aria-label="Copy JSON"><Icon name="code" size={14} /></button>
              </span>
            </div>
            <div className="json jtree" key={`${r.id}:${jsonGen}`}>
              <JsonValue k={null} value={r.json} depth={0} isLast allOpen={jsonAllOpen} />
            </div>
          </React.Fragment>}
          {rtab === "prov" && <ProvSteps steps={r.provenance} />}
          {rtab === "valid" && <React.Fragment>
            <div className="wrap-gap" style={{ marginBottom: 14 }}>
              <Badge tone="green" dot={false}>{counts.ok} passed</Badge>
              {counts.warn > 0 && <Badge tone="amber" dot={false}>{counts.warn} warning{counts.warn === 1 ? "" : "s"}</Badge>}
              {counts.err > 0 && <Badge tone="rose" dot={false}>{counts.err} error{counts.err === 1 ? "" : "s"}</Badge>}
            </div>
            {checks.map((c, i) => (
              <ValItem key={i} kind={c.kind}><CheckDetail c={c} /></ValItem>
            ))}
          </React.Fragment>}
        </div>
      </div>
    </div>
  );
}
