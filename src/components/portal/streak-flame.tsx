import { motion } from "framer-motion";

export function StreakFlame({
  currentStreak,
  longestStreak,
  hasCheckedInToday,
}: {
  currentStreak: number;
  longestStreak: number;
  hasCheckedInToday: boolean;
}) {
  const isHot = currentStreak >= 3;
  
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 shadow-sm"
      title={`Current Streak: ${currentStreak} days`}
    >
      <div className="relative flex items-center justify-center h-6 w-6">
        {hasCheckedInToday ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-xl ${isHot ? "text-highlight" : "text-highlight-hover"}`}
          >
            🔥
          </motion.div>
        ) : (
          <div className="text-xl opacity-30 grayscale filter">🔥</div>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium leading-none text-text">
          {currentStreak}
        </span>
      </div>
    </div>
  );
}
