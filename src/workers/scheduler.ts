// Scheduler cron job. Runs every 15 minutes on Render and enqueues
// recurring workflows: outcome check-ins, intake nudges, practice launch
// readiness refresh.
//
// This is a one-shot script — it runs, enqueues, and exits.

import { prisma } from "../lib/db/prisma";
import { dispatch } from "../lib/orchestration/dispatch";
import { sendDueVisitReminders } from "../lib/scheduling/send-reminders";
import { getDefaultAdapter } from "../lib/billing/clearinghouse/gateway";
import { parse999, parse277CA, decide277Actions } from "../lib/billing/clearinghouse-ack";
import { recordDeadLetter } from "../lib/billing/clearinghouse/dead-letter";
import { derivePrimaryControlNumbers } from "../lib/agents/billing/clearinghouse-submission-agent";
import { writeAgentAudit } from "../lib/orchestration/context";
import { reconcileThrottleState } from "../lib/billing/cost-guardrails";
import { sumTokensMTD, llmUsageAvailable } from "../lib/ai/usage-repository";

function resolvePrevisitPortalUrl(env: NodeJS.ProcessEnv): string | null {
  return env.PREVISIT_PORTAL_URL ?? env.NEXT_PUBLIC_APP_URL ?? env.APP_URL ?? null;
}

async function main() {
  console.log("[scheduler] tick");
  const now = new Date();

  // 1. Outcome tracker refresh for every active patient that's been active
  //    in the last 30 days but has no check-in logged in the last 5 days.
  const cutoffActive = new Date(now.getTime() - 30 * 86400000);
  const cutoffCheckin = new Date(now.getTime() - 5 * 86400000);

  const patients = await prisma.patient.findMany({
    where: {
      status: "active",
      updatedAt: { gte: cutoffActive },
      outcomeLogs: { none: { loggedAt: { gte: cutoffCheckin } } },
    },
    select: { id: true, organizationId: true },
  });

  for (const p of patients) {
    await dispatch({
      name: "encounter.completed",
      encounterId: `virtual:${p.id}`,
      patientId: p.id,
      completedAt: now,
    });
  }

  // 2. Intake stalled nudge for prospects with incomplete intake > 48h.
  const cutoffStalled = new Date(now.getTime() - 48 * 3600000);
  const stalled = await prisma.patient.findMany({
    where: {
      status: "prospect",
      updatedAt: { lte: cutoffStalled },
    },
    select: { id: true, organizationId: true },
  });

  for (const p of stalled) {
    await dispatch({
      name: "patient.intake.stalled",
      patientId: p.id,
      organizationId: p.organizationId,
      intent: "intake_nudge",
    });
  }

  // 3. Adherence drift sweep — once per day, at the 09:00 UTC tick.
  //    The scheduler runs every 15 minutes; gating on hour+minute keeps
  //    this fleet-wide scan to a single execution per day.
  let adherenceEnqueued = 0;
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  if (utcHour === 9 && utcMinute < 15) {
    const withActiveRegimen = await prisma.patient.findMany({
      where: {
        status: "active",
        deletedAt: null,
        dosingRegimens: { some: { active: true } },
      },
      select: { id: true, organizationId: true },
    });
    for (const p of withActiveRegimen) {
      await dispatch({
        name: "adherence.checkup.requested",
        patientId: p.id,
        organizationId: p.organizationId,
      });
    }
    adherenceEnqueued = withActiveRegimen.length;
  }

  // 4. CFO weekly briefing — Monday 06:00 UTC. Fires the cfo agent for
  //    every organization. Writes a fresh P&L, cash flow, balance sheet,
  //    KPI dashboard, and CFO narrative briefing.
  let cfoEnqueued = 0;
  const isMondayMorning =
    now.getUTCDay() === 1 && utcHour === 6 && utcMinute < 15;
  if (isMondayMorning) {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    for (const o of orgs) {
      await dispatch({
        name: "cfo.report.generate",
        organizationId: o.id,
        period: "weekly",
      });
    }
    cfoEnqueued = orgs.length;
  }

  // 5. CFO monthly briefing — 1st of month, 07:00 UTC.
  const isFirstOfMonth =
    now.getUTCDate() === 1 && utcHour === 7 && utcMinute < 15;
  if (isFirstOfMonth) {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    for (const o of orgs) {
      await dispatch({
        name: "cfo.report.generate",
        organizationId: o.id,
        period: "monthly",
      });
    }
    cfoEnqueued += orgs.length;
  }

  // 6. Visit SMS reminders. Appointment and pre-visit completion nudges always
  //    run; per-org URL overrides are resolved inside sendDueVisitReminders with
  //    the global env value as a fallback. Appointments whose orgs have no valid
  //    portal URL are quarantined per-appointment in previsit.details.
  const reminderResult = await sendDueVisitReminders({
    now,
    portalUrl: resolvePrevisitPortalUrl(process.env),
  });
  const previsitSent = reminderResult.previsit.sent;
  const previsitSkipped = reminderResult.previsit.skipped;

  console.log(
    `[scheduler] enqueued outcome=${patients.length} stalled=${stalled.length} adherence=${adherenceEnqueued} cfo=${cfoEnqueued} ` +
      `sms=${reminderResult.appointment.sent} (skipped=${reminderResult.appointment.skipped}) ` +
      `previsit=${previsitSent} (skipped=${previsitSkipped})`,
  );

  // 6. Clearinghouse functional/payer acknowledgment polling
  await pollClearinghouseGateway();

  // 7. Reconcile AI cost-guardrail throttle state (EMR-756) from the real
  //    LlmUsage ledger — flips PracticeSubscription.throttled when a practice
  //    crosses its monthly token allowance (manual overrides win).
  await reconcileAiThrottles();
}

async function reconcileAiThrottles(): Promise<void> {
  // If the LlmUsage table isn't present yet (the pre-`db push` window), usage
  // sums are 0 for "no data" — reconciling would compute usedTokensMTD=0 and
  // un-throttle every legitimately-capped practice. Skip until the table lands.
  if (!llmUsageAvailable()) {
    console.log("[scheduler] ai-throttle reconcile skipped — LlmUsage table absent");
    return;
  }
  // Reach the PracticeSubscription delegate defensively — same pattern as
  // cost-guardrails, since it may not be in older generated clients.
  const subs = (prisma as unknown as Record<string, any>)["practiceSubscription"];
  if (!subs?.findMany) return;
  let reconciled = 0;
  let flipped = 0;
  try {
    const rows: Array<{ organizationId: string }> = await subs.findMany({
      where: { includedMonthlyTokens: { not: null } },
      select: { organizationId: true },
    });
    for (const row of rows) {
      const usedTokensMTD = await sumTokensMTD(row.organizationId);
      const result = await reconcileThrottleState({
        prisma,
        organizationId: row.organizationId,
        usedTokensMTD,
      });
      reconciled++;
      if (result.flipped) flipped++;
    }
  } catch (err) {
    console.error("[scheduler] AI throttle reconcile failed", err);
  }
  console.log(
    `[scheduler] ai-throttle reconciled=${reconciled} flipped=${flipped}`,
  );
}

export async function pollClearinghouseGateway() {
  console.log("[scheduler] polling clearinghouse gateway");

  const org = await prisma.organization.findFirst();
  const organizationId = org?.id ?? "global-fallback";

  // Wrap in Postgres advisory lock
  await prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(1217) as locked;
    `;
    if (!locked) {
      console.log("[scheduler] clearinghouse polling is already running, skipping tick");
      return;
    }

    const adapter = getDefaultAdapter(process.env);
    const adapterId = adapter.name.toLowerCase();

    // Fetch latest cursor from BillingMemory
    const cursorRow = await tx.billingMemory.findFirst({
      where: {
        scope: `clearinghouse:${adapterId}`,
        category: "poll_cursor",
      },
    });
    const currentCursor = cursorRow?.content ?? null;

    console.log(`[scheduler] current polling cursor for ${adapter.name}: ${currentCursor}`);

    // Poll the adapter
    const pollResult = await adapter.poll(currentCursor);
    console.log(`[scheduler] polled ${pollResult.documents.length} documents`);

    // Process documents
    for (const doc of pollResult.documents) {
      console.log(`[scheduler] processing document of type ${doc.type}`);

      try {
        if (doc.type === "999") {
          const parsed = parse999(doc.body);

          // Match 999: Parse functional group control numbers and find the matching submission
          let submission = null;
          if (doc.correlationId) {
            submission = await tx.clearinghouseSubmission.findUnique({
              where: { id: doc.correlationId },
              include: { claim: true },
            });
          }

          if (!submission && (parsed.gcn || parsed.icn)) {
            // Find by control number match
            const pendingSubmissions = await tx.clearinghouseSubmission.findMany({
              where: { responseStatus: "pending" },
              include: { claim: true },
            });

            for (const sub of pendingSubmissions) {
              const expectedNumbers = derivePrimaryControlNumbers(sub.claimId, sub.retryCount);
              if (
                (parsed.gcn && Number(parsed.gcn) === expectedNumbers.gsControlNumber) ||
                (parsed.icn && Number(parsed.icn) === expectedNumbers.isaControlNumber)
              ) {
                submission = sub;
                break;
              }
            }
          }

          if (!submission) {
            console.warn(`[scheduler] unmatched 999 document (gcn: ${parsed.gcn}, icn: ${parsed.icn}). Routing to DLQ.`);
            await recordDeadLetter({
              organizationId,
              submissionId: null,
              claimId: null,
              gatewayName: adapter.name,
              failureCategory: "permanent_rejection",
              errorMessage: `Unmatched 999 document. gcn=${parsed.gcn}, icn=${parsed.icn}`,
              requestPayload: null,
              responseBody: doc.body,
            });
            continue;
          }

          const targetResponseStatus = parsed.status === "rejected" ? "rejected" : "accepted";
          const targetClaimStatus: "ch_rejected" | "submitted" = parsed.status === "rejected" ? "ch_rejected" : "submitted";

          // Update ClearinghouseSubmission
          await tx.clearinghouseSubmission.update({
            where: { id: submission.id },
            data: {
              responseStatus: targetResponseStatus,
              responseCode: parsed.status,
              responseMessage: parsed.errors.map(e => `${e.segmentId || ""}: ${e.message}`).join("; ") || "999 parsed successfully",
              respondedAt: new Date(),
              ediResponse: doc.body,
            },
          });

          // Monotonic status guard
          const STATUS_RANKS: Record<string, number> = {
            draft: 0,
            scrubbing: 1,
            scrub_blocked: 2,
            ready: 3,
            submitted: 4,
            ch_rejected: 2,
            pending: 5,
            accepted: 6,
            adjudicated: 7,
            paid: 7,
            partial: 7,
          };

          const currentRank = STATUS_RANKS[submission.claim.status] ?? -1;
          const newRank = STATUS_RANKS[targetClaimStatus] ?? -1;

          if (newRank > currentRank) {
            await tx.claim.update({
              where: { id: submission.claimId },
              data: { status: targetClaimStatus },
            });
          }

          // Trigger domain events
          if (parsed.status === "rejected") {
            const priorSubmissionCount = submission.retryCount;
            const isRejectionRetryEligible = (attempts: number) => attempts < 2;

            await dispatch({
              name: "clearinghouse.rejected",
              claimId: submission.claimId,
              submissionId: submission.id,
              rejectionCode: "999_REJECT",
              rejectionMessage: parsed.errors.map(e => `${e.segmentId || ""}: ${e.message}`).join("; ") || "999 rejection",
              retryEligible: isRejectionRetryEligible(priorSubmissionCount),
              organizationId: submission.organizationId,
            });

            await writeAgentAudit(
              "clearinghouseSubmission",
              "1.0.0",
              submission.organizationId,
              "submission.rejected",
              { type: "ClearinghouseSubmission", id: submission.id },
              { claimId: submission.claimId, errors: parsed.errors },
            );
          } else {
            await dispatch({
              name: "clearinghouse.accepted",
              claimId: submission.claimId,
              submissionId: submission.id,
              organizationId: submission.organizationId,
            });

            await writeAgentAudit(
              "clearinghouseSubmission",
              "1.0.0",
              submission.organizationId,
              "submission.accepted",
              { type: "ClearinghouseSubmission", id: submission.id },
              { claimId: submission.claimId, gcn: parsed.gcn, icn: parsed.icn },
            );
          }

        } else if (doc.type === "277CA") {
          const parsed = parse277CA(doc.body);
          const actions = decide277Actions(parsed);

          for (const action of actions) {
            const claim = await tx.claim.findFirst({
              where: {
                OR: [
                  { id: action.claimControlNumber },
                  { claimNumber: action.claimControlNumber },
                ],
              },
              include: { submissions: { orderBy: { submittedAt: "desc" } } },
            });

            if (!claim) {
              console.warn(`[scheduler] 277CA contains unmatched claim control number: ${action.claimControlNumber}. Routing to DLQ.`);
              await recordDeadLetter({
                organizationId,
                submissionId: null,
                claimId: null,
                gatewayName: adapter.name,
                failureCategory: "permanent_rejection",
                errorMessage: `277CA contains unmatched claim control number: ${action.claimControlNumber}`,
                requestPayload: null,
                responseBody: doc.body,
              });
              continue;
            }

            const latestSubmission = claim.submissions[0];
            if (!latestSubmission) {
              console.warn(`[scheduler] claim ${claim.id} has no submission history but received 277CA. Routing to DLQ.`);
              await recordDeadLetter({
                organizationId: claim.organizationId,
                submissionId: null,
                claimId: claim.id,
                gatewayName: adapter.name,
                failureCategory: "permanent_rejection",
                errorMessage: `Claim ${claim.id} has no submission history but received 277CA`,
                requestPayload: null,
                responseBody: doc.body,
              });
              continue;
            }

            let targetResponseStatus: "accepted" | "rejected" = "accepted";
            let targetClaimStatus: "accepted" | "ch_rejected" = "accepted";

            if (action.action === "resubmit" || action.action === "investigate") {
              targetResponseStatus = "rejected";
              targetClaimStatus = "ch_rejected";
            }

            // Update ClearinghouseSubmission
            await tx.clearinghouseSubmission.update({
              where: { id: latestSubmission.id },
              data: {
                responseStatus: targetResponseStatus,
                responseCode: action.action,
                responseMessage: (action as any).reason ?? "277CA status update",
                respondedAt: new Date(),
                ediResponse: doc.body,
              },
            });

            // Monotonic status guard
            const STATUS_RANKS: Record<string, number> = {
              draft: 0,
              scrubbing: 1,
              scrub_blocked: 2,
              ready: 3,
              submitted: 4,
              ch_rejected: 2,
              pending: 5,
              accepted: 6,
              adjudicated: 7,
              paid: 7,
              partial: 7,
            };

            const currentRank = STATUS_RANKS[claim.status] ?? -1;
            const newRank = STATUS_RANKS[targetClaimStatus] ?? -1;

            if (newRank > currentRank) {
              await tx.claim.update({
                where: { id: claim.id },
                data: { status: targetClaimStatus },
              });
            }

            if (targetResponseStatus === "rejected") {
              const isRejectionRetryEligible = (attempts: number) => attempts < 2;
              await dispatch({
                name: "clearinghouse.rejected",
                claimId: claim.id,
                submissionId: latestSubmission.id,
                rejectionCode: action.action,
                rejectionMessage: (action as any).reason ?? "277CA rejection",
                retryEligible: isRejectionRetryEligible(latestSubmission.retryCount),
                organizationId: claim.organizationId,
              });

              await writeAgentAudit(
                "clearinghouseSubmission",
                "1.0.0",
                claim.organizationId,
                "submission.rejected",
                { type: "ClearinghouseSubmission", id: latestSubmission.id },
                { claimId: claim.id, action: action.action, reason: (action as any).reason },
              );
            } else {
              await dispatch({
                name: "clearinghouse.accepted",
                claimId: claim.id,
                submissionId: latestSubmission.id,
                organizationId: claim.organizationId,
              });

              await tx.financialEvent.create({
                data: {
                  organizationId: claim.organizationId,
                  patientId: claim.patientId,
                  claimId: claim.id,
                  type: "claim_submitted",
                  amountCents: claim.billedAmountCents,
                  description: `Claim accepted by payer clearinghouse gateway. Billed: $${(claim.billedAmountCents / 100).toFixed(2)}.`,
                  metadata: {
                    submissionId: latestSubmission.id,
                    clearinghouseName: latestSubmission.clearinghouseName,
                    action: action.action,
                  },
                  createdByAgent: "clearinghouseSubmission@1.0.0",
                },
              });

              await writeAgentAudit(
                "clearinghouseSubmission",
                "1.0.0",
                claim.organizationId,
                "submission.accepted",
                { type: "ClearinghouseSubmission", id: latestSubmission.id },
                { claimId: claim.id, action: action.action },
              );
            }
          }
        }
      } catch (err: any) {
        console.error(`[scheduler] system failure processing document:`, err);
        await recordDeadLetter({
          organizationId,
          submissionId: null,
          claimId: null,
          gatewayName: adapter.name,
          failureCategory: "malformed_response",
          errorMessage: err instanceof Error ? err.message : String(err),
          requestPayload: null,
          responseBody: doc.body,
        });
        throw err;
      }
    }

    if (pollResult.nextCursor) {
      if (cursorRow) {
        await tx.billingMemory.update({
          where: { id: cursorRow.id },
          data: { content: pollResult.nextCursor, lastEvidenceAt: new Date() },
        });
      } else {
        await tx.billingMemory.create({
          data: {
            organizationId,
            scope: `clearinghouse:${adapterId}`,
            category: "poll_cursor",
            content: pollResult.nextCursor,
            evidenceCount: 1,
            confidence: 1.0,
          },
        });
      }
      console.log(`[scheduler] cursor advanced to: ${pollResult.nextCursor}`);
    }
  }, { timeout: 30000 });
}

if (process.argv[1]?.endsWith("scheduler.ts") || process.argv[1]?.endsWith("scheduler")) {
  main()
    .catch((err) => {
      console.error("[scheduler] error", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
