"use client";
/* LEAFNERD — top command bar */
import { Icon } from "./primitives";

export function CommandBar({ onAsk }: { onAsk?: () => void }) {
  return (
    <header className="cmdbar">
      <div className="search" onClick={onAsk} style={{ cursor: "text" }}>
        <Icon name="search" size={16} />
        <input placeholder="Ask Leafnerd, or search patients & resources…" readOnly />
        <span className="kbd">⌘K</span>
      </div>
      <div className="cmd-spacer"></div>
      <button className="cmd-ctrl"><Icon name="source" size={15} /><span className="mut">Sources</span><b>4 active</b><Icon name="chevD" size={13} /></button>
      <button className="cmd-ctrl"><Icon name="clock" size={15} /><b>Last 30 days</b><Icon name="chevD" size={13} /></button>
      <span className="fhir-chip"><Icon name="git" size={14} />FHIR R4 · US Core 6.1</span>
      <span className="sync"><span className="dot"></span>Synced 14m</span>
      <button className="ai-btn" onClick={onAsk}><Icon name="spark" size={15} className="spark" />Ask Leafnerd</button>
    </header>
  );
}
