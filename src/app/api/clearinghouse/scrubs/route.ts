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

const scrubInput = z.object({
  claimId: z.string().min(1),
  scrubVersion: z.string().min(1),
  status: z.enum(["clean", "warnings", "blocked"]),
  edits: z.array(z.record(z.unknown())).optional(),
  ncciConflicts: z.array(z.record(z.unknown())).optional(),
  modifierWarnings: z.array(z.record(z.unknown())).optional(),
  missingFields: z.array(z.record(z.unknown())).optional(),
});

export async function POST(req: Request) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();
    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = scrubInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const result = await prisma.claimScrubResult.create({
      data: {
        claimId: parsed.data.claimId,
        scrubVersion: parsed.data.scrubVersion,
        status: parsed.data.status,
        edits: (parsed.data.edits ?? []) as Prisma.InputJsonValue,
        ncciConflicts: (parsed.data.ncciConflicts ?? []) as Prisma.InputJsonValue,
        modifierWarnings: (parsed.data.modifierWarnings ?? []) as Prisma.InputJsonValue,
        missingFields: (parsed.data.missingFields ?? []) as Prisma.InputJsonValue,
      },
    });

    await prisma.claim.update({
      where: { id: parsed.data.claimId },
      data: {
        scrubIssues: {
          status: parsed.data.status,
          edits: parsed.data.edits ?? [],
          ncciConflicts: parsed.data.ncciConflicts ?? [],
          modifierWarnings: parsed.data.modifierWarnings ?? [],
          missingFields: parsed.data.missingFields ?? [],
        } as Prisma.InputJsonValue,
        scrubbedAt: result.scrubbedAt,
      },
    });

    return NextResponse.json({ result }, { status: 201 });
  })) as NextResponse;
}
