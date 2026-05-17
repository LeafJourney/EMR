// EMR-734 — Anomaly detector registry.
//
// Concrete detectors register themselves by importing this module's
// `registerDetector` helper and calling it at module top-level. The sweep
// cron imports the registry getter and iterates all registered detectors.
//
// THIS FILE INTENTIONALLY DOES NOT REGISTER ANY DETECTORS. The framework
// + sweep cron + Anomaly model are landing alone in EMR-734 so that
// EMR-737 (4 detectors), EMR-740 (webhook health), and EMR-741 (stale
// config) can land independently against a stable surface.
//
// When EMR-737/740/741 land, each adds a `import "./detectors/<slug>"`
// line to the section below — the side-effecting import registers the
// detector with the framework. Co-locating registration here gives PR
// reviewers a single file to scan for "what does the sweep run?".

export {
  registerDetector,
  getRegisteredDetectors,
  type AnomalyDetector,
  type AnomalyEmission,
  type AnomalySeverity,
} from "./framework";

// ── Detector registrations ────────────────────────────────
//
// Each concrete detector module is expected to call `registerDetector`
// at import time. The registry is intentionally empty until those
// modules land.
//
// EMR-737:
//   import "./detectors/stuck-publish";
//   import "./detectors/template-regression";
//   import "./detectors/auth-failure-spike";
//   import "./detectors/cron-stall";
//
// EMR-740:
//   import "./detectors/webhook-health";
//
// EMR-741:
//   import "./detectors/stale-config";
