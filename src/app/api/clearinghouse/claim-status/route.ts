import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeClaimStatusInquiry } from "@/lib/db/clearinghouse";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import {
  invalidInput,
  readJson,
  withAuthErrors,
} from "@/app/api/configs/_helpers";

export const runtime = "nodejs";

const claimStatusInput = z.object({
  claimId: z.string().min(1),
  organizationId: z.string().min(1),
  payerName: z.string().min(1),
  status: z.enum(["pending", "accepted", "rejected", "paid", "denied", "unknown"]),
  requestPayload: z.record(z.unknown()).optional(),
  responsePayload: z.record(z.unknown()).nullable().optional(),
  respondedAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();
    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = claimStatusInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const normalized = normalizeClaimStatusInquiry({
      ...parsed.data,
      respondedAt: parsed.data.respondedAt
        ? new Date(parsed.data.respondedAt)
        : null,
    });

    const inquiry = await prisma.clearinghouseClaimStatusInquiry.create({
      data: {
        ...normalized,
        requestPayload: normalized.requestPayload as Prisma.InputJsonValue,
        responsePayload: normalized.responsePayload
          ? (normalized.responsePayload as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return NextResponse.json({ inquiry }, { status: 201 });
  })) as NextResponse;
}
