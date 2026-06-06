import { semanticDiff, type SemanticDiffEntry } from "@/lib/practice-config/diff";

export const CONTROLLER_MIN_STEP = 1;
export const CONTROLLER_MAX_STEP = 15;

export type VersionLike = {
  id: string;
  version: number;
  snapshot: unknown;
};

export type VersionDiff = {
  fromVersion: number;
  toVersion: number;
  entries: SemanticDiffEntry[];
};

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function buildPracticeConfigurationVersionDiff(
  from: VersionLike,
  to: VersionLike,
): VersionDiff {
  return {
    fromVersion: from.version,
    toVersion: to.version,
    entries: semanticDiff(asRecord(from.snapshot), asRecord(to.snapshot)),
  };
}

export function isRollbackSnapshotBlocked(snapshot: unknown): boolean {
  const record = asRecord(snapshot);
  const deprecatedTemplateIds = record.deprecatedTemplateIds;
  if (Array.isArray(deprecatedTemplateIds) && deprecatedTemplateIds.length > 0) {
    return true;
  }

  const templateStatus = record.templateStatus;
  if (templateStatus === "deprecated") return true;

  const templateStatuses = record.templateStatuses;
  if (templateStatuses && typeof templateStatuses === "object") {
    return Object.values(templateStatuses as Record<string, unknown>).some(
      (status) => status === "deprecated",
    );
  }

  return false;
}

export function normalizeControllerStep(step: unknown): number {
  if (typeof step !== "number" || !Number.isFinite(step)) return CONTROLLER_MIN_STEP;
  return Math.min(
    CONTROLLER_MAX_STEP,
    Math.max(CONTROLLER_MIN_STEP, Math.trunc(step)),
  );
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
