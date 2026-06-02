/**
 * Public surface of the scheduling engine (Phase 12 Track 3).
 *
 * Re-exports the pure, dependency-free algorithm modules so callers can
 * `import { rankSlots, rankWaitlist, computeMetrics } from "@/lib/scheduling"`
 * instead of reaching into individual files. Only deterministic, DB-free
 * modules are surfaced here — the server-side dispatch worker
 * (`send-reminders.ts`, which talks to Prisma + the SMS adapter) is
 * intentionally excluded so this barrel stays safe to import from any layer.
 *
 * Note: `analytics.ts` and `workflow-efficiency.ts` each export a local
 * `percentile` helper with different conventions (linear-interpolated vs.
 * nearest-rank). Per ES module semantics that name is ambiguous through the
 * barrel and is omitted — import it from the specific module if you need it.
 */
export * from "./cadence-engine";
export * from "./no-show-model";
export * from "./self-serve";
export * from "./slot-recommender";
export * from "./intake-gate";
export * from "./provider-prefs";
export * from "./reminders";
export * from "./ics-export";
export * from "./waitlist";
export * from "./recurring";
export * from "./analytics";
// workflow-efficiency re-exported explicitly: its `percentile` helper collides
// with analytics' (different convention), so we omit it from the barrel.
export {
  WorkflowRoleSchema,
  ClickEventSchema,
  TASK_CLICK_TARGETS,
  aggregateByTask,
  aggregateByUser,
  aggregateByRole,
  flagRegressions,
} from "./workflow-efficiency";
export type {
  WorkflowRole,
  ClickEvent,
  TaskAggregate,
  UserAggregate,
  RoleAggregate,
  RegressionFlag,
} from "./workflow-efficiency";
