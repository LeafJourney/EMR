// EMR-151 — Supplement wheel data fetcher (server-only).
//
// Pulled out of `supplement-wheel.ts` so the client component can import
// types and pure helpers without dragging the Prisma client into the
// browser bundle.

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import type {
  SupplementCompound as DbSupplement,
  SupplementCompoundEvidence as DbEvidence,
} from "@prisma/client";
import {
  BUILTIN_SUPPLEMENTS,
  ratingFromEvidence,
  type SupplementCompoundView,
  type SupplementEvidence,
} from "./supplement-wheel";

function mapEvidence(e: DbEvidence): SupplementEvidence {
  return e;
}

function mapRow(row: DbSupplement): SupplementCompoundView {
  const evidence = mapEvidence(row.evidence);
  // The DB model predates the `rating`/`articles` columns (EMR-151), so we
  // derive a star rating from the evidence band and fall back to the
  // built-in curated articles when a matching seed id exists. This keeps the
  // wheel feature-complete without a migration.
  const builtin = BUILTIN_SUPPLEMENTS.find((b) => b.id === row.id);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.color,
    evidence,
    rating: ratingFromEvidence(evidence),
    description: row.description,
    symptoms: row.symptoms,
    benefits: row.benefits,
    risks: row.risks,
    cannabisInteraction: row.cannabisInteraction,
    articles: builtin?.articles ?? [],
  };
}

export const getSupplementCompounds = cache(
  async (): Promise<SupplementCompoundView[]> => {
    try {
      const rows = await prisma.supplementCompound.findMany({
        where: { active: true },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      });
      return rows.map(mapRow);
    } catch {
      // DB unreachable (e.g. local dev without seed) — return the
      // built-in fallback so the wheel still renders.
      return BUILTIN_SUPPLEMENTS;
    }
  },
);
