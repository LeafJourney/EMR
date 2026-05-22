"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { Trophy, Star, Medal, Crown } from "lucide-react";

export interface BadgeData {
  id: string;
  name: string;
  description: string;
  tier: "bronze" | "silver" | "gold" | "diamond";
  earnedAt?: string;
}

interface BadgeShowcaseProps {
  badges: BadgeData[];
}

const TIER_COLORS = {
  bronze: "from-orange-700 to-amber-900 border-orange-500/50 text-orange-200",
  silver: "from-slate-400 to-slate-600 border-slate-300/50 text-slate-100",
  gold: "from-yellow-400 to-amber-600 border-yellow-300/50 text-yellow-50",
  diamond: "from-cyan-300 to-blue-600 border-cyan-200/50 text-cyan-50",
};

const TIER_ICONS = {
  bronze: Trophy,
  silver: Medal,
  gold: Star,
  diamond: Crown,
};

export function BadgeShowcase({ badges }: BadgeShowcaseProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <div className="bg-surface rounded-3xl border border-border p-6 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-2xl font-semibold text-text">Achievement Showcase</h2>
          <p className="text-text-muted text-sm mt-1">Badges earned on your wellness journey.</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
          <Trophy size={24} />
        </div>
      </div>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
      >
        {badges.map((badge) => {
          const Icon = TIER_ICONS[badge.tier];
          const isEarned = !!badge.earnedAt;

          return (
            <motion.div
              key={badge.id}
              variants={item}
              className={cn(
                "relative group flex flex-col items-center p-4 rounded-2xl border transition-all duration-300",
                isEarned 
                  ? "bg-surface-raised border-border hover:shadow-lg hover:-translate-y-1" 
                  : "bg-surface/50 border-dashed border-border/50 opacity-60 grayscale"
              )}
            >
              <div 
                className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mb-3 shadow-inner bg-gradient-to-br",
                  TIER_COLORS[badge.tier]
                )}
              >
                <Icon size={28} className={isEarned ? "drop-shadow-md" : "opacity-50"} />
              </div>
              
              <h3 className="text-sm font-semibold text-text text-center leading-tight mb-1">
                {badge.name}
              </h3>
              
              {isEarned ? (
                <p className="text-[10px] text-text-subtle font-mono uppercase">
                  {new Date(badge.earnedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              ) : (
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                  Locked
                </p>
              )}

              {/* Tooltip on hover */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 p-2 bg-ink text-surface text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center shadow-xl">
                {badge.description}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-ink rotate-45" />
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
