"use client";

import { motion } from "framer-motion";
import { Leaf } from "lucide-react";

interface StrainCardProps {
  name: string;
  type: string;
  thc: number;
  cbd: number;
  terpenes: string[];
}

export function ApothecaryStrainCard({ name, type, thc, cbd, terpenes }: StrainCardProps) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-2xl group"
      style={{
        backgroundImage: "linear-gradient(to bottom right, rgba(30, 41, 59, 1), rgba(15, 23, 42, 1))",
      }}
    >
      {/* Subtle glowing orb in background */}
      <div className="absolute top-0 right-0 -mt-16 -mr-16 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl group-hover:bg-emerald-400/30 transition-colors duration-500" />

      <div className="relative p-6 border-b border-slate-800">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold mb-1">
              {type}
            </div>
            <h3 className="font-display text-2xl font-bold text-slate-100">{name}</h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-500 shadow-inner">
            <Leaf size={18} />
          </div>
        </div>

        <div className="flex gap-4 mt-6">
          <div className="flex-1">
            <div className="text-xs text-slate-400 mb-1">THC</div>
            <div className="font-mono text-xl text-slate-200">{thc}%</div>
            <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: `${Math.min(100, thc * 3)}%` }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs text-slate-400 mb-1">CBD</div>
            <div className="font-mono text-xl text-slate-200">{cbd}%</div>
            <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, cbd * 3)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="relative p-6 bg-slate-950/50">
        <div className="text-xs text-slate-400 uppercase tracking-widest mb-3">Dominant Terpenes</div>
        <div className="flex flex-wrap gap-2">
          {terpenes.map((terpene) => (
            <span
              key={terpene}
              className="px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-medium text-slate-300"
            >
              {terpene}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
