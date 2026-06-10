import {
  resolveFleetEnabled,
  defaultFleetEnabledForPractice,
  FLEET_INERT_CUTOFF,
} from "@/lib/orchestration/fleet";
import { assertEval, type EvalCase } from "../harness";

// Safety — "ship inert" must hold: new practices off, existing grandfathered,
// explicit operator choice always wins.
export const fleetEvalCases: EvalCase[] = [
  {
    suite: "fleet-inert",
    name: "new practice ships inert (agents off)",
    run: () => {
      const newPractice = new Date(FLEET_INERT_CUTOFF.getTime() + 86_400_000);
      assertEval(
        defaultFleetEnabledForPractice(newPractice) === false,
        "a practice created after the cutoff should default OFF",
      );
      assertEval(
        resolveFleetEnabled({ fleetDefaultEnabled: false }, "scribe").enabled ===
          false,
        "an inert practice's agent should resolve to disabled",
      );
    },
  },
  {
    suite: "fleet-inert",
    name: "existing practice is grandfathered (agents on)",
    run: () => {
      const oldPractice = new Date(FLEET_INERT_CUTOFF.getTime() - 86_400_000);
      assertEval(
        defaultFleetEnabledForPractice(oldPractice) === true,
        "a practice created before the cutoff should default ON",
      );
      assertEval(
        resolveFleetEnabled({}, "scribe").enabled === true,
        "an absent fleetDefaultEnabled must grandfather to enabled",
      );
      assertEval(
        resolveFleetEnabled(null, "scribe").enabled === true,
        "a practice with no config at all must grandfather to enabled",
      );
    },
  },
  {
    suite: "fleet-inert",
    name: "explicit per-agent override wins over the practice default",
    run: () => {
      assertEval(
        resolveFleetEnabled(
          { fleetDefaultEnabled: false, fleet: { scribe: { enabled: true } } },
          "scribe",
        ).enabled === true,
        "an explicit enable must override an inert default",
      );
      assertEval(
        resolveFleetEnabled(
          { fleetDefaultEnabled: true, fleet: { scribe: { enabled: false } } },
          "scribe",
        ).enabled === false,
        "an explicit disable must override an enabled default",
      );
    },
  },
];
