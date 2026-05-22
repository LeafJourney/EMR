import { prisma } from "@/lib/db/prisma";

export async function recordDailyCheckIn(patientId: string, timestamp: Date = new Date()) {
  const dateStr = timestamp.toISOString().split("T")[0];

  const streak = await prisma.dailyCheckInStreak.findUnique({
    where: { patientId },
  });

  if (!streak) {
    // First time checking in
    const newStreak = await prisma.dailyCheckInStreak.create({
      data: {
        patientId,
        currentStreak: 1,
        longestStreak: 1,
        lastCheckInDate: dateStr,
      },
    });
    
    let newlyEarnedBadges: any[] = [];
    try {
      const { evaluateBadges } = await import("./badges");
      newlyEarnedBadges = await evaluateBadges(patientId);
    } catch (err) {
      console.error("Badge evaluation failed", err);
    }
    return { streak: newStreak, newlyEarnedBadges };
  }

  if (streak.lastCheckInDate === dateStr) {
    // Already checked in today
    return { streak, newlyEarnedBadges: [] };
  }

  // Determine if it was exactly yesterday
  const lastDate = streak.lastCheckInDate ? new Date(streak.lastCheckInDate) : null;
  const isConsecutive = lastDate && (timestamp.getTime() - lastDate.getTime() <= 48 * 60 * 60 * 1000);

  const newCurrent = isConsecutive ? streak.currentStreak + 1 : 1;
  const newLongest = Math.max(newCurrent, streak.longestStreak);

  const updatedStreak = await prisma.dailyCheckInStreak.update({
    where: { patientId },
    data: {
      currentStreak: newCurrent,
      longestStreak: newLongest,
      lastCheckInDate: dateStr,
    },
  });

  // If they hit a 7-day perfect week, grant a Freeze Token
  if (isConsecutive && newCurrent === 7) {
    await prisma.freezeToken.create({
      data: {
        patientId,
        source: "7_day_perfect_week",
      },
    });
  }

  // 6. Evaluate Badges (EMR-101)
  let newlyEarnedBadges: any[] = [];
  try {
    const { evaluateBadges } = await import("./badges");
    newlyEarnedBadges = await evaluateBadges(patientId);
  } catch (err) {
    console.error("Badge evaluation failed", err);
  }

  return { streak: updatedStreak, newlyEarnedBadges };
}

export async function getActiveFreezeTokens(patientId: string) {
  return prisma.freezeToken.count({
    where: {
      patientId,
      isUsed: false,
    },
  });
}

export async function applyFreezeToken(patientId: string) {
  const token = await prisma.freezeToken.findFirst({
    where: { patientId, isUsed: false },
    orderBy: { createdAt: "asc" },
  });

  if (!token) return { ok: false, error: "No available freeze tokens." };

  const streak = await prisma.dailyCheckInStreak.findUnique({
    where: { patientId },
  });

  if (!streak || !streak.lastCheckInDate) return { ok: false, error: "No streak to repair." };

  // Repair the streak by moving lastCheckInDate up by one day
  const newDate = new Date(streak.lastCheckInDate);
  newDate.setDate(newDate.getDate() + 1);
  const newDateStr = newDate.toISOString().split("T")[0];

  await prisma.$transaction([
    prisma.freezeToken.update({
      where: { id: token.id },
      data: { isUsed: true, usedOnDate: newDateStr, usedAt: new Date() },
    }),
    prisma.dailyCheckInStreak.update({
      where: { patientId },
      data: {
        lastCheckInDate: newDateStr,
        currentStreak: streak.currentStreak + 1,
        longestStreak: Math.max(streak.longestStreak, streak.currentStreak + 1),
      },
    }),
  ]);

  return { ok: true };
}
