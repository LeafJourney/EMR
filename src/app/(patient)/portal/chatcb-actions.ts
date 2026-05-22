"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { resolveModelClient } from "@/lib/orchestration/model-client";

interface ChatCBMessageInput {
  threadId?: string;
  content: string;
}

export async function sendChatCBMessage(input: ChatCBMessageInput) {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    include: {
      dosingRegimens: { where: { active: true }, include: { product: true } }
    }
  });

  if (!patient) throw new Error("Patient not found");

  let threadId = input.threadId;

  // 1. Create thread if not exists
  if (!threadId) {
    const thread = await prisma.aICoachThread.create({
      data: {
        patientId: patient.id,
        title: "Chat Session",
      },
    });
    threadId = thread.id;
  }

  // 2. Persist user message
  await prisma.aICoachMessage.create({
    data: {
      threadId,
      role: "user",
      content: input.content,
    },
  });

  // 3. Fetch chat history
  const history = await prisma.aICoachMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });

  // 4. Build prompt context (EMR-104)
  const dosingContext = patient.dosingRegimens.map((r) => 
    `- ${r.product?.name ?? "Unknown Product"}: ${r.calculatedThcMgPerDose}mg THC / ${r.calculatedCbdMgPerDose}mg CBD, ${r.frequencyPerDay}x/day`
  ).join("\n");

  const systemPrompt = `You are ChatCB, a friendly AI health coach for cannabis patients.
You are talking to ${patient.firstName}.
Be conversational, encouraging, and brief. Do not give medical diagnosis.
Active Dosing Regimens:
${dosingContext || "None active."}

If the user expresses a desire to log their symptoms or check in today, you MUST append the exact string "[TRIGGER_SYMPTOM_LOG]" to the very end of your response.
`;

  const conversationLines = history.map((m) => `### ${m.role.toUpperCase()}\n${m.content}`).join("\n\n");
  const fullPrompt = `${systemPrompt}\n\n${conversationLines}\n\n### ASSISTANT`;

  // 5. Query Model
  const client = resolveModelClient();
  const rawAnswer = await client.complete(fullPrompt, {
    maxTokens: 300,
    temperature: 0.5,
  });

  const answer = rawAnswer.trim();

  // 6. Persist assistant message
  const aiMessage = await prisma.aICoachMessage.create({
    data: {
      threadId,
      role: "assistant",
      content: answer,
    },
  });

  return {
    threadId,
    message: {
      id: aiMessage.id,
      role: "assistant" as const,
      content: answer,
    }
  };
}
