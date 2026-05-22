"use client";

import { motion } from "framer-motion";

interface HealthRingsProps {
  checkinProgress: number; // 0-1
  adherenceProgress: number; // 0-1
  intakeProgress: number; // 0-1
  size?: number;
  strokeWidth?: number;
}

export function HealthRings({
  checkinProgress,
  adherenceProgress,
  intakeProgress,
  size = 140,
  strokeWidth = 14,
}: HealthRingsProps) {
  const center = size / 2;
  const radius1 = center - strokeWidth;
  const radius2 = radius1 - strokeWidth - 2;
  const radius3 = radius2 - strokeWidth - 2;

  const circumference1 = 2 * Math.PI * radius1;
  const circumference2 = 2 * Math.PI * radius2;
  const circumference3 = 2 * Math.PI * radius3;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 transform"
      >
        {/* Background Rings */}
        <circle cx={center} cy={center} r={radius1} stroke="currentColor" strokeWidth={strokeWidth} fill="none" className="text-accent/20" />
        <circle cx={center} cy={center} r={radius2} stroke="currentColor" strokeWidth={strokeWidth} fill="none" className="text-highlight/20" />
        <circle cx={center} cy={center} r={radius3} stroke="currentColor" strokeWidth={strokeWidth} fill="none" className="text-blue-500/20" />

        {/* Foreground Rings */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius1}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className="text-accent"
          strokeDasharray={circumference1}
          initial={{ strokeDashoffset: circumference1 }}
          animate={{ strokeDashoffset: circumference1 * (1 - Math.min(1, checkinProgress)) }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius2}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className="text-highlight"
          strokeDasharray={circumference2}
          initial={{ strokeDashoffset: circumference2 }}
          animate={{ strokeDashoffset: circumference2 * (1 - Math.min(1, adherenceProgress)) }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius3}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className="text-blue-500"
          strokeDasharray={circumference3}
          initial={{ strokeDashoffset: circumference3 }}
          animate={{ strokeDashoffset: circumference3 * (1 - Math.min(1, intakeProgress)) }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.4 }}
        />
      </svg>
    </div>
  );
}
