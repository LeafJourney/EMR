import React from "react";
import { UtensilsCrossed, Apple, Coffee, Droplet } from "lucide-react";

export function MealPlanCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-orange-50 dark:bg-orange-900/20 px-6 py-5 border-b border-orange-100 dark:border-orange-900/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-orange-100 dark:bg-orange-800 p-2 rounded-xl">
            <UtensilsCrossed className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <h2 className="text-xl font-bold text-orange-900 dark:text-orange-100">
            Nutrition & Diet
          </h2>
        </div>
        <p className="text-sm text-orange-700 dark:text-orange-400">
          Support your endocannabinoid system with omega-rich foods and balanced macronutrients.
        </p>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Apple className="w-4 h-4 text-rose-500" />
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Omega-3 Focus</h3>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Increase intake of chia seeds, walnuts, and wild-caught fish to provide building blocks for endocannabinoids.
            </p>
          </div>
          
          <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Droplet className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Hydration</h3>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Drink at least 80oz of water daily. Cannabis therapy can increase mild dehydration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
