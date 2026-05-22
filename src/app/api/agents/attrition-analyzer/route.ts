import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-079: Patient Attrition Risk Analyzer
// AI Agent that analyzes patient behavioral data (e.g., cancelled appointments, 
// no-shows, delayed prescription refills) to calculate a churn risk score. 
// Automatically queues high-risk patients for a retention outreach campaign.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.attrition_analyzer.started" });

    // 1. Fetch patients with recent 'cancelled' or 'no-show' encounters
    const atRiskPatients = await prisma.patient.findMany({
      where: {
        // Mock logic: fetching all prospects for now
        status: "prospect"
      },
      include: {
        encounters: {
          where: { status: "cancelled" }
        }
      },
      take: 100
    });

    let flaggedCount = 0;

    for (const patient of atRiskPatients) {
      // 2. Mock: Risk Scoring Logic
      const missedVisits = patient.encounters.length;
      let riskScore = 0; // 0 to 100

      if (missedVisits >= 2) riskScore += 50;
      if (!patient.email && !patient.phone) riskScore += 30; // Unreachable
      
      if (riskScore >= 50) {
        // 3. Queue for Retention Campaign
        logger.info({ 
          event: "agents.attrition_analyzer.high_risk_flagged", 
          patientId: patient.id, 
          riskScore 
        });

        // Add to a retention queue / outreach campaign
        await prisma.outreachCampaign.create({
          data: {
            organizationId: patient.organizationId,
            name: "High Risk Retention Check-in",
            channel: "email",
            bodyTemplate: "Hi there, we noticed you missed a recent appointment. We care about your progress. Please call us to reschedule.",
            status: "draft",
            createdById: "system",
          }
        });
        
        flaggedCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      patientsAnalyzed: atRiskPatients.length,
      highRiskIdentified: flaggedCount
    });

  } catch (error) {
    logger.error({ event: "agents.attrition_analyzer.failed", error });
    return NextResponse.json({ error: "Failed to run attrition analyzer" }, { status: 500 });
  }
}
