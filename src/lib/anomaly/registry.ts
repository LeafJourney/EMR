// EMR-734 — Anomaly detector registry.
//
// Concrete detectors are imported here and registered via
// `registerDetector`. The sweep cron imports `getRegisteredDetectors` and
// iterates the list. Centralising registration in one file gives PR
// reviewers a single place to scan for "what does the sweep run?".

import { registerDetector } from "./framework";
import { stuckPublishDetector } from "./detectors/stuck-publish";
import { billingDropDetector } from "./detectors/billing-drop";
import { agentFailureDetector } from "./detectors/agent-failure";
import { loginFailureDetector } from "./detectors/login-failure";
import { webhookHealthDetector } from "./detectors/webhook-health";
import { staleConfigDetector } from "./detectors/stale-config";

export {
  registerDetector,
  getRegisteredDetectors,
  type AnomalyDetector,
  type AnomalyEmission,
  type AnomalySeverity,
} from "./framework";

// ── Detector registrations ────────────────────────────────
//
// EMR-737 (four detectors): stuck-publish, billing-drop, agent-failure,
// and a login-failure no-op stub (real source pending — see header in
// login-failure.ts).
registerDetector(stuckPublishDetector);
registerDetector(billingDropDetector);
registerDetector(agentFailureDetector);
registerDetector(loginFailureDetector);

// EMR-740 — fleet-wide webhook delivery health.
registerDetector(webhookHealthDetector);

// EMR-741 — stale specialty manifest version.
registerDetector(staleConfigDetector);
