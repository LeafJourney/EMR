import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { resolveModelClient } from "@/lib/orchestration/model-client";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    
    // Must be a LeafNerd or Super Admin
    const memberships = await prisma.membership.findMany({ where: { userId: user.id } });
    const hasAccess = memberships.some((m: { role: string }) => m.role === 'leafnerd' || m.role === 'super_admin');
    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { message } = await req.json();
    
    const recentOutcomesCount = await prisma.outcomeLog.count({
      where: { loggedAt: { gte: new Date(Date.now() - 7 * 86400000) } }
    });

    const activePatients = await prisma.patient.count({
      where: { status: 'active' }
    });

    const prompt = `You are the LeafNerd Insight Assistant, a cutting-edge clinical intelligence AI.
Current real-time database state:
- Active Patients: ${activePatients}
- Outcome Logs (Last 7 Days): ${recentOutcomesCount}

The user asked: "${message}"
Provide a brief (max 3 sentences), highly analytical response summarizing insights based on the available data.`;

    const client = resolveModelClient();
    const replyText = await client.complete(prompt);

    return NextResponse.json({ reply: replyText });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
