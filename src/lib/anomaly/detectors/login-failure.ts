// EMR-737 — Login-failure spike detector.
//
// Per-organization detector for a sudden burst of failed sign-ins.
//
// TODO(login-failure-source): There is no first-class auth-failure log on
// main today. Clerk's webhook surface includes `user.failed_sign_in` events,
// but they are not yet routed into a persistent table this detector could
// read. Until that lands, this detector is a no-op stub that emits nothing —
// running it costs ~0 and the sweep cron tolerates an empty emission list.
//
// When the upstream source lands, the body becomes a group-by-organization
// count over the last 24h with thresholds (>5 → WARNING, >20 → CRITICAL).

import type { PrismaClient } from "@prisma/client";

import type { AnomalyDetector, AnomalyEmission } from "../framework";

export const loginFailureDetector: AnomalyDetector = {
  slug: "login_failure",
  async run(_prisma: PrismaClient): Promise<AnomalyEmission[]> {
    return [];
  },
};
