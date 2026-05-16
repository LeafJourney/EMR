"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Snowflake, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FreezeTokenStoreProps {
  availableTokens: number;
  onApplyFreeze?: () => void;
}

export function FreezeTokenStore({ availableTokens, onApplyFreeze }: FreezeTokenStoreProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50/50 text-blue-600 hover:bg-blue-50 border border-blue-100 transition-colors"
      >
        <Snowflake size={14} className="text-blue-500" />
        <span className="text-xs font-semibold tabular-nums">{availableTokens}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-surface shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="font-display font-semibold text-text flex items-center gap-2">
                  <Snowflake size={18} className="text-blue-500" />
                  Streak Freezes
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-text-subtle hover:text-text hover:bg-surface-hover rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                    <Snowflake size={32} className="text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-text mb-1">
                    {availableTokens} Available
                  </h3>
                  <p className="text-sm text-text-muted">
                    Earn 1 freeze for every 7-day perfect streak.
                  </p>
                </div>

                <div className="bg-surface-raised border border-border rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-accent mt-0.5 shrink-0" />
                    <p className="text-sm text-text-muted leading-relaxed">
                      A Streak Freeze protects your streak if you miss a day. 
                      You can manually apply it here to repair a recently broken streak, 
                      or let it act as an automatic safety net for your next missed check-in.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={availableTokens === 0}
                    onClick={() => {
                      if (onApplyFreeze) onApplyFreeze();
                      setIsOpen(false);
                    }}
                  >
                    Apply Freeze Token
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setIsOpen(false)}
                  >
                    Save for Later
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
