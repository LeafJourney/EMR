"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  assertChartAccess,
  requirePermission,
  ForbiddenError,
} from "@/lib/rbac/permissions";

// EMR-1094: persist lab + imaging orders to the chart. Previously the
// order forms console.logged a payload and pretended to submit; now every
// "Submit order" writes a ClinicalOrder row. External transmission (HL7 /
// FHIR to a lab or imaging center) is still NOT wired — rows are created
// with transmissionMode "simulated" and status "placed" so the record is
// honest about what actually happened.

const schema = z.object({
  patientId: z.string().min(1),
  orderType: z.enum(["lab", "imaging"]),
  /** Primary code(s) — comma-joined for multi-test lab requisitions. */
  orderCode: z.string().min(1).max(500),
  /** Human-readable name(s) for the order list view. */
  orderName: z.string().min(1).max(1000),
  priority: z.enum(["routine", "stat"]),
  diagnosisCodes: z.array(z.string().min(1).max(16)).max(20),
  /** Full structured order exactly as the form built it. */
  payload: z.record(z.unknown()),
});

export type CreateClinicalOrderInput = z.infer<typeof schema>;

export type CreateClinicalOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

export async function createClinicalOrder(
  input: CreateClinicalOrderInput,
): Promise<CreateClinicalOrderResult> {
  const user = await requireUser();

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  try {
    // "labs.sign" is the diagnostic-ordering grant in the RBAC matrix
    // ("Lab orders + results review") — held by mid-levels, clinicians,
    // and practice owners. Imaging orders share it: there is no separate
    // imaging key, and both are diagnostic orders signed by a provider.
    requirePermission(user, "labs.sign");
    // Org-scoped patient verification + chart-privacy gate.
    await assertChartAccess(user, parsed.data.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "You don't have permission to place orders." };
    }
    throw err;
  }

  const order = await prisma.clinicalOrder.create({
    data: {
      organizationId: user.organizationId!,
      patientId: parsed.data.patientId,
      orderType: parsed.data.orderType,
      orderCode: parsed.data.orderCode,
      orderName: parsed.data.orderName,
      priority: parsed.data.priority,
      diagnosisCodes: parsed.data.diagnosisCodes as any,
      payload: parsed.data.payload as any,
      status: "placed",
      transmissionMode: "simulated",
      orderedById: user.id,
      orderedByName:
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email,
    },
  });

  // Audit-log the order placement — same direct-write pattern as the
  // referrals surface. No PHI beyond codes; the payload stays on the
  // ClinicalOrder row itself.
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action:
        parsed.data.orderType === "lab"
          ? "order.lab.placed"
          : "order.imaging.placed",
      subjectType: "Patient",
      subjectId: parsed.data.patientId,
      metadata: {
        clinicalOrderId: order.id,
        orderCode: parsed.data.orderCode,
        priority: parsed.data.priority,
        diagnosisCodes: parsed.data.diagnosisCodes,
        transmissionMode: "simulated",
      } as any,
    },
  });

  revalidatePath(`/clinic/patients/${parsed.data.patientId}/orders/labs`);
  revalidatePath(`/clinic/patients/${parsed.data.patientId}/orders/imaging`);
  revalidatePath(`/clinic/patients/${parsed.data.patientId}`);

  return { ok: true, orderId: order.id };
}
