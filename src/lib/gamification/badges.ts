import { prisma } from "@/lib/db/prisma";

export async function evaluateBadges(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      dailyStreak: true,
      patientBadges: { include: { badge: true } }
    }
  });

  if (!patient) return [];

  const earnedBadgeSlugs = new Set(patient.patientBadges.map(pb => pb.badge.slug));
  const newlyEarnedIds: string[] = [];

  // Seed badges if they don't exist
  const allBadges = await prisma.badge.findMany();
  if (allBadges.length === 0) {
    await prisma.badge.createMany({
      data: [
        { slug: "first_step", name: "First Step", description: "Completed your first check-in.", tier: "bronze" },
        { slug: "streak_3", name: "Momentum", description: "Achieved a 3-day streak.", tier: "silver" },
        { slug: "streak_7", name: "Perfect Week", description: "Achieved a 7-day streak.", tier: "gold" },
        { slug: "streak_30", name: "Zen Master", description: "Achieved a 30-day streak.", tier: "diamond" },
      ]
    });
  }

  const activeBadges = await prisma.badge.findMany();
  const getBadgeId = (slug: string) => activeBadges.find(b => b.slug === slug)?.id;

  const streak = patient.dailyStreak?.currentStreak || 0;
  const longestStreak = patient.dailyStreak?.longestStreak || 0;

  // Rule 1: First check-in
  if (longestStreak >= 1 && !earnedBadgeSlugs.has("first_step")) {
    const id = getBadgeId("first_step");
    if (id) newlyEarnedIds.push(id);
  }

  // Rule 2: 3-day streak
  if (longestStreak >= 3 && !earnedBadgeSlugs.has("streak_3")) {
    const id = getBadgeId("streak_3");
    if (id) newlyEarnedIds.push(id);
  }

  // Rule 3: 7-day streak
  if (longestStreak >= 7 && !earnedBadgeSlugs.has("streak_7")) {
    const id = getBadgeId("streak_7");
    if (id) newlyEarnedIds.push(id);
  }

  // Rule 4: 30-day streak
  if (longestStreak >= 30 && !earnedBadgeSlugs.has("streak_30")) {
    const id = getBadgeId("streak_30");
    if (id) newlyEarnedIds.push(id);
  }

  const grantedBadges = [];
  for (const badgeId of newlyEarnedIds) {
    const pb = await prisma.patientBadge.create({
      data: { patientId, badgeId }
    });
    grantedBadges.push(pb);
  }

  return grantedBadges;
}
