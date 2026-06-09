-- EMR-1079 — Task.kind: category for the unified staff worklist (/ops/tasks)
-- so it can facet by type per the Back-Office Operations Audit. Nullable;
-- existing rows fall into the "Unspecified" bucket until classified.

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('verify_benefits', 'obtain_auth', 'refill', 'recall', 'message_reply', 'records_request', 'billing_followup', 'clinical_review', 'patient_task', 'other');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "kind" "TaskKind";

-- CreateIndex
CREATE INDEX "Task_organizationId_kind_idx" ON "Task"("organizationId", "kind");
