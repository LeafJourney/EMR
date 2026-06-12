"use client";
/* LEAFNERD — top command bar */
import { Icon } from "./primitives";

export function CommandBar({
  onAsk,
  onSources,
  toast,
}: {
  onAsk?: () => void;
  /** Jump to the Admin / governance surface (the source-of-truth for feeds). */
  onSources?: () => void;
  toast?: (m: string) => void;
}) {
  return (
    <header className="cmdbar">
      <div
        className="search"
        onClick={onAsk}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onAsk?.();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Ask Leafnerd, or search patients & resources"
        style={{ cursor: "text" }}
      >
        <Icon name="search" size={16} />
        <input
          placeholder="Ask Leafnerd, or search patients & resources…"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />
        <span className="kbd">⌘K</span>
      </div>
      <div className="cmd-spacer"></div>
      <span className="badge green demo-chip" title="Synthetic, de-identified demo data — safe to show">
        <span className="bd"></span>Demo dataset · de-identified
      </span>
      <button className="cmd-ctrl" onClick={onSources} title="View connected data sources">
        <Icon name="source" size={15} /><span className="mut">Sources</span><b>4 active</b><Icon name="chevD" size={13} />
      </button>
      <button className="cmd-ctrl" onClick={() => toast?.("Time range — showing the last 30 days")}>
        <Icon name="clock" size={15} /><b>Last 30 days</b><Icon name="chevD" size={13} />
      </button>
      <span className="fhir-chip"><Icon name="git" size={14} />FHIR R4 · US Core 6.1</span>
      <span className="sync"><span className="dot"></span>Synced 14m</span>
      <button className="ai-btn" onClick={onAsk}><Icon name="spark" size={15} className="spark" />Ask Leafnerd</button>
    </header>
  );
}
