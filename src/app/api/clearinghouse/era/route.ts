import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import {
  invalidInput,
  readJson,
  withAuthErrors,
} from "@/app/api/configs/_helpers";

export const runtime = "nodejs";

const eraInput = z.object({
  organizationId: z.string().min(1),
  eraFileId: z.string().min(1).nullable().optional(),
  payerName: z.string().min(1).nullable().optional(),
  status: z.enum(["received", "parsed", "posted", "exception"]).optional(),
  rawPayload: z.string().nullable().optional(),
  parsedPayload: z.record(z.unknown()).nullable().optional(),
  exceptionReason: z.string().nullable().optional(),
  postedAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();
    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = eraInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const ingestion = await prisma.eraIngestion.create({
      data: {
        organizationId: parsed.data.organizationId,
        eraFileId: parsed.data.eraFileId ?? null,
        payerName: parsed.data.payerName ?? null,
        status: parsed.data.status ?? "received",
        rawPayload: parsed.data.rawPayload ?? null,
        parsedPayload: parsed.data.parsedPayload
          ? (parsed.data.parsedPayload as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        exceptionReason: parsed.data.exceptionReason ?? null,
        postedAt: parsed.data.postedAt ? new Date(parsed.data.postedAt) : null,
      },
    });

    return NextResponse.json({ ingestion }, { status: 201 });
  })) as NextResponse;
}
