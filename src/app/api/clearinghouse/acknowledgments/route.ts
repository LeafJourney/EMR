import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { classifyAcknowledgment } from "@/lib/db/clearinghouse";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import {
  invalidInput,
  readJson,
  withAuthErrors,
} from "@/app/api/configs/_helpers";

export const runtime = "nodejs";

const acknowledgmentInput = z.object({
  organizationId: z.string().min(1),
  submissionId: z.string().min(1).nullable().optional(),
  claimId: z.string().min(1).nullable().optional(),
  type: z.enum(["999", "277CA"]),
  status: z.enum(["accepted", "accepted_with_errors", "rejected", "pending", "unknown"]),
  acceptedClaimCount: z.number().int().nonnegative().optional(),
  rejectedClaimCount: z.number().int().nonnegative().optional(),
  rawPayload: z.record(z.unknown()).nullable().optional(),
});

export async function POST(req: Request) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();
    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = acknowledgmentInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const summary = classifyAcknowledgment({
      type: parsed.data.type,
      status: parsed.data.status,
      acceptedClaimCount: parsed.data.acceptedClaimCount,
      rejectedClaimCount: parsed.data.rejectedClaimCount,
    });

    const acknowledgment = await prisma.clearinghouseAcknowledgment.create({
      data: {
        organizationId: parsed.data.organizationId,
        submissionId: parsed.data.submissionId ?? null,
        claimId: parsed.data.claimId ?? null,
        type: parsed.data.type === "999" ? "ack_999" : "ack_277ca",
        status: summary.status,
        acceptedClaimCount: summary.acceptedClaimCount,
        rejectedClaimCount: summary.rejectedClaimCount,
        rawPayload: parsed.data.rawPayload
          ? (parsed.data.rawPayload as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return NextResponse.json({ acknowledgment }, { status: 201 });
  })) as NextResponse;
}
