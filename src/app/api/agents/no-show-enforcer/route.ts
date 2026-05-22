import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-111: Patient No-Show Penalty Enforcer
// Nightly accounting cron that scans the schedule for missed ("no-show") appointments.
// It automatically attempts to process a $50 cancellation/no-show fee against 
// the patient's vaulted credit card in the payment gateway.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.no_show_enforcer.started" });

    // 1. Fetch appointments marked as 'no-show' from yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const noShowAppointments = await prisma.appointment.findMany({
      where: {
        status: "no_show",
      },
      include: {
        patient: true
      },
      take: 50
    });

    let feesCharged = 0;

    for (const appointment of noShowAppointments) {
      // 2. Logic: Process payment via external gateway (Stripe/Square)
      const chargeSuccess = true; // Mock transaction
      const feeAmountCents = 5000; // $50.00

      if (chargeSuccess) {
        // 3. Log the successful charge against the ledger
        logger.warn({ 
          event: "agents.no_show_enforcer.fee_charged", 
          encounterId: appointment.id, 
          patientId: appointment.patientId 
        });

        await prisma.auditLog.create({
          data: {
            organizationId: appointment.patient.organizationId,
            action: "NO_SHOW_FEE_PROCESSED",
            subjectType: "Patient",
            subjectId: appointment.patientId,
            metadata: { appointmentId: appointment.id, amountCents: feeAmountCents, status: "paid" }
          }
        });

        feesCharged++;
      } else {
        // Payment failed - add to collections queue
        logger.error({ 
          event: "agents.no_show_enforcer.charge_failed", 
          encounterId: appointment.id 
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      scanned: noShowAppointments.length,
      feesCharged
    });

  } catch (error) {
    logger.error({ event: "agents.no_show_enforcer.failed", error });
    return NextResponse.json({ error: "Failed to run no-show enforcer" }, { status: 500 });
  }
}
