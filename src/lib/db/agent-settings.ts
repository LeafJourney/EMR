// EMR-974 — Agent Fleet enable/disable accessors (server-side).
//
// Durable replacement for the localStorage-only toggle in the mission-control
// client. The orchestration runner (separate track) should call `isAgentEnabled`
// before invoking an agent for an org and skip it gracefully when disabled.

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveAgentEnabled } from "./agent-settings-logic";

export { resolveAgentEnabled };

/** Is `agentName` enabled for `organizationId`? Absent row ⇒ enabled (fail-open). */
export async function isAgentEnabled(
  organizationId: string | null | undefined,
  agentName: string,
): Promise<boolean> {
  if (!organizationId) return true;
  const row = await prisma.agentSetting.findUnique({
    where: { organizationId_agentName: { organizationId, agentName } },
    select: { enabled: true },
  });
  return resolveAgentEnabled(row);
}

/** All explicit settings rows for an org (rows that don't exist default to enabled). */
export async function listAgentSettings(organizationId: string) {
  return prisma.agentSetting.findMany({
    where: { organizationId },
    orderBy: { agentName: "asc" },
  });
}

/** Map of agentName → enabled for the rows that exist (callers default missing keys to true). */
export async function getAgentEnabledMap(
  organizationId: string,
): Promise<Record<string, boolean>> {
  const rows = await prisma.agentSetting.findMany({
    where: { organizationId },
    select: { agentName: true, enabled: true },
  });
  return Object.fromEntries(rows.map((r) => [r.agentName, r.enabled]));
}

export interface SetAgentEnabledInput {
  organizationId: string;
  agentName: string;
  enabled: boolean;
  updatedById?: string | null;
}

/** Upsert the enable flag for one agent in one org. */
export async function setAgentEnabled(input: SetAgentEnabledInput) {
  const { organizationId, agentName, enabled, updatedById } = input;
  return prisma.agentSetting.upsert({
    where: { organizationId_agentName: { organizationId, agentName } },
    update: { enabled, updatedById: updatedById ?? null },
    create: { organizationId, agentName, enabled, updatedById: updatedById ?? null },
  });
}
