"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

interface ConfettiEvent {
  id: string;
  type: "badge_earned" | "streak_milestone";
  message: string;
}

// Simple event bus for confetti triggers
export const confettiEmitter = {
  listeners: new Set<(event: ConfettiEvent) => void>(),
  emit: (event: ConfettiEvent) => {
    confettiEmitter.listeners.forEach((listener) => listener(event));
  },
  subscribe: (listener: (event: ConfettiEvent) => void) => {
    confettiEmitter.listeners.add(listener);
    return () => {
      confettiEmitter.listeners.delete(listener);
    };
  },
};

export function ConfettiCanvas() {
  const [activeEvent, setActiveEvent] = useState<ConfettiEvent | null>(null);

  useEffect(() => {
    return confettiEmitter.subscribe((event) => {
      setActiveEvent(event);
      
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ["#10b981", "#3b82f6", "#f59e0b"]
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ["#10b981", "#3b82f6", "#f59e0b"]
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        } else {
          setTimeout(() => setActiveEvent(null), 2000);
        }
      };
      
      frame();
    });
  }, []);

  if (!activeEvent) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-10 duration-500">
      <div className="bg-white/90 backdrop-blur-md shadow-2xl border border-emerald-100 rounded-full px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xl">
          🏆
        </div>
        <p className="font-display font-semibold text-slate-800">
          {activeEvent.message}
        </p>
      </div>
    </div>
  );
}
