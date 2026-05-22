// EMR-741 — Stale-config detector.
//
// Compares each published `PracticeConfiguration` against the latest
// non-deprecated version of its specialty manifest from the template
// registry. Flags configs that are N versions behind.
//
//   - 1 version behind  → not flagged (normal lag during a rollout).
//   - 2 versions behind → INFO.
//   - 3+ versions behind → WARNING.
//
// Severity caps at WARNING. Stale config is a slow-burn problem — we don't
// want it to ever page someone.
//
// Idempotency key: `stale_config:${configId}:${YYYY-MM-DD}` so the same
// stale config on the same UTC day collapses to one row.
//
// PHI: none. `context` carries config/org ids, current vs latest version
// strings, and the version-distance count.

import type { PrismaClient } from "@prisma/client";

import type { AnomalyDetector, AnomalyEmission } from "../framework";
import {
  getSpecialtyTemplate,
  listAllManifestVersions,
} from "@/lib/specialty-templates/registry";

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function dayBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Number of registered (non-deprecated) versions between `current` and the
 * latest. Returns 0 when `current` is the latest, 1 when one behind, etc.
 * Returns null when we can't locate the current version in the registry.
 */
function versionsBehind(slug: string, current: string, latest: string): number | null {
  if (current === latest) return 0;
  const all = listAllManifestVersions(slug);
  if (all.length === 0) return null;
  const idxLatest = all.findIndex((m) => m.version === latest);
  const idxCurrent = all.findIndex((m) => m.version === current);
  if (idxLatest < 0 || idxCurrent < 0) return null;
  return Math.abs(idxCurrent - idxLatest);
}

export const staleConfigDetector: AnomalyDetector = {
  slug: "stale_config",
  async run(prisma: PrismaClient): Promise<AnomalyEmission[]> {
    const configs = await prisma.practiceConfiguration.findMany({
      where: {
        status: "published",
        selectedSpecialty: { not: null },
        selectedSpecialtyVersion: { not: null },
      },
      select: {
        id: true,
        organizationId: true,
        practiceId: true,
        selectedSpecialty: true,
        selectedSpecialtyVersion: true,
      },
    });

    const now = new Date();
    const bucket = dayBucket(now);
    const emissions: AnomalyEmission[] = [];

    for (const config of configs) {
      const slug = config.selectedSpecialty;
      const current = config.selectedSpecialtyVersion;
      if (!slug || !current) continue;

      const latestManifest = getSpecialtyTemplate(slug);
      if (!latestManifest) continue;
      const behind = versionsBehind(slug, current, latestManifest.version);
      if (behind === null || behind < 2) continue;

      const severity = behind >= 3 ? "warning" : "info";
      const idempotencyKey = `stale_config:${config.id}:${bucket}`;
      emissions.push({
        slug: `stale-config-${config.id}-${bucket}`,
        idempotencyKey,
        severity,
        practiceId: config.practiceId,
        message: `${slug} config is ${behind} versions behind (${current} → ${latestManifest.version})`,
        deeplinkUrl: `/admin/practices/${config.organizationId}`,
        context: {
          configId: config.id,
          organizationId: config.organizationId,
          specialtySlug: slug,
          currentVersion: current,
          latestVersion: latestManifest.version,
          versionsBehind: behind,
        },
        ttlSeconds: TTL_SECONDS,
      });
    }

    return emissions;
  },
};
