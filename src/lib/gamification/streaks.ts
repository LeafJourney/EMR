import { prisma } from "@/lib/db/prisma";

export async function recordDailyCheckIn(patientId: string, timestamp: Date = new Date()) {
  const dateStr = timestamp.toISOString().split("T")[0];

  const streak = await prisma.dailyCheckInStreak.findUnique({
    where: { patientId },
  });

  if (!streak) {
    // First time checking in
    return prisma.dailyCheckInStreak.create({
      data: {
        patientId,
        currentStreak: 1,
        longestStreak: 1,
        lastCheckInDate: dateStr,
      },
    });
  }

  if (streak.lastCheckInDate === dateStr) {
    // Already checked in today
    return streak;
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
  if (isConsecutive && newCurrent > 0 && newCurrent % 7 === 0) {
    await prisma.freezeToken.create({
      data: {
        patientId,
        source: "7_day_perfect_week",
      },
    });
  }

  return updatedStreak;
}

export async function getActiveFreezeTokens(patientId: string) {
  return prisma.freezeToken.count({
    where: {
      patientId,
      isUsed: false,
    },
  });
}
