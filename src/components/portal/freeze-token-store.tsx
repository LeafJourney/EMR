"use client";

import { useState } from "react";
import { Snowflake, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <DialogTitle className="font-display font-semibold text-text flex items-center gap-2">
                  <Snowflake size={18} className="text-blue-500" />
                  Streak Freezes
                </DialogTitle>
                {/* Dialog primitive provides the absolute-positioned X — no
                    second close button here. */}
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
        </DialogContent>
      </Dialog>
    </>
  );
}
