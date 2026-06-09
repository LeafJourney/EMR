// EMR-457 — Source connectors: CSV ingest API.
//
// POST /api/connectors/csv
//   body: { migrationProfileId, category, csv, idempotencyKey? }
//   Parses the CSV, maps each row onto canonical field names using the
//   profile category's fieldMappings, and stages the result into a queued
//   MigrationJob (sourcePayload = { category, rows }). The EMR-456 runner cron
//   then imports it. Re-posting the same idempotencyKey returns the existing
//   job instead of staging a duplicate.
//
// Auth: Implementation Admin (onboarding controller surface), matching
// /api/migration-jobs.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { logControllerAction } from "@/lib/auth/audit-stub";
import {
  invalidInput,
  readJson,
  withAuthErrors,
} from "@/app/api/configs/_helpers";
import {
  fieldMappingsForCategory,
  mapRowsForCategory,
  parseCsv,
} from "@/lib/migration/csv-connector";

export const runtime = "nodejs";

const ingestInput = z.object({
  migrationProfileId: z.string().min(1),
  category: z.string().min(1).max(60),
  csv: z.string().min(1).max(5_000_000),
  idempotencyKey: z.string().max(200).nullish(),
});

export async function POST(req: Request) {
  return (await withAuthErrors(async () => {
    const admin = await requireImplementationAdmin();

    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = ingestInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const { migrationProfileId, category, csv, idempotencyKey } = parsed.data;

    const profile = await prisma.migrationProfile.findUnique({
      where: { id: migrationProfileId },
      select: { id: true, configurationId: true, categories: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "migration_profile_not_found" },
        { status: 404 },
      );
    }

    // Idempotency: a re-post with the same key returns the existing job.
    if (idempotencyKey) {
      const existing = await prisma.migrationJob.findFirst({
        where: { migrationProfileId, idempotencyKey },
      });
      if (existing) {
        return NextResponse.json({ job: existing, deduplicated: true });
      }
    }

    const { rows } = parseCsv(csv);
    if (rows.length === 0) {
      return NextResponse.json({ error: "csv_has_no_data_rows" }, { status: 400 });
    }

    const mappings = fieldMappingsForCategory(profile.categories, category);
    const mappedRows = mapRowsForCategory(rows, mappings);

    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: profile.configurationId },
      select: { organizationId: true },
    });
    const organizationId =
      config?.organizationId ?? admin.organizationId ?? "pending";

    const job = await prisma.migrationJob.create({
      data: {
        organizationId,
        migrationProfileId,
        configurationId: profile.configurationId,
        sourceType: "csv",
        status: "queued",
        idempotencyKey: idempotencyKey ?? null,
        rowsTotal: mappedRows.length,
        sourcePayload: {
          category,
          rows: mappedRows,
        } as unknown as Prisma.InputJsonValue,
        createdById: admin.id,
      },
    });

    await logControllerAction({
      actor: admin,
      action: "controller.connector.csv_staged",
      targetId: job.id,
      after: { migrationProfileId, category, rowsStaged: mappedRows.length },
    });

    return NextResponse.json(
      { job, rowsStaged: mappedRows.length },
      { status: 201 },
    );
  })) as NextResponse;
}
