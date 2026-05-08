"use client";

import React, { useState } from "react";
import { Sparkles, Heart, Star, CheckCircle } from "lucide-react";

/**
 * Positive Input Prompt Component (EMR-024)
 * Encourages patients to log a positive experience or feeling for the day.
 */
export function PositiveInputPrompt() {
  const [inputValue, setInputValue] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim().length > 0) {
      // In a real app, this would hit an API endpoint to save the log
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setInputValue("");
      }, 3000);
    }
  };

  if (isSubmitted) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-6 text-center shadow-sm flex flex-col items-center justify-center min-h-[200px] animate-in fade-in zoom-in duration-300">
        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-800/60 flex items-center justify-center mb-3">
          <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 mb-1">
          Positivity Logged!
        </h3>
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Taking time to reflect helps build a resilient mindset.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl p-6 shadow-sm relative overflow-hidden">
      {/* Decorative background elements */}
      <Sparkles className="absolute top-4 right-4 w-12 h-12 text-amber-200/50 dark:text-amber-800/30" />
      
      <div className="relative z-10 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <div className="bg-amber-100 dark:bg-amber-900/60 p-1.5 rounded-lg">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
            Daily Reflection
          </span>
        </div>
        
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2 leading-tight">
          What went well today?
        </h3>
        
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-5">
          Focusing on small victories can significantly improve your endocannabinoid tone and overall well-being.
        </p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="I slept through the night without waking up..."
            className="w-full resize-none rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white/80 dark:bg-neutral-900/50 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600 placeholder:text-neutral-400 min-h-[80px]"
            rows={2}
            maxLength={200}
          />
          
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-neutral-400 font-medium">
              {inputValue.length}/200
            </span>
            <button
              type="submit"
              disabled={inputValue.trim().length === 0}
              className="flex items-center gap-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              <Star className="w-4 h-4" />
              Save Moment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
