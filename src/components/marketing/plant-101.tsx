import React from "react";
import { Leaf, FlaskConical, Stethoscope } from "lucide-react";

export function Plant101Section() {
  return (
    <section className="py-24 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-emerald-600 dark:text-emerald-400 font-semibold tracking-wide uppercase text-sm mb-3">
            Education
          </h2>
          <h3 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-6 tracking-tight">
            The Medicine of the Plant, <br className="hidden md:block"/> Deconstructed
          </h3>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            We don't deal in strains; we deal in chemotypes. Discover how specific cannabinoid and terpene profiles drive targeted therapeutic outcomes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-3xl p-8 border border-neutral-200 dark:border-neutral-700 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-colors">
            <div className="bg-emerald-100 dark:bg-emerald-900/40 w-14 h-14 rounded-2xl flex items-center justify-center mb-6">
              <Leaf className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h4 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">Chemotypes</h4>
            <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-sm">
              Moving beyond Indica vs. Sativa, we classify medicine by its dominant cannabinoids (Type I, II, III).
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-3xl p-8 border border-neutral-200 dark:border-neutral-700 hover:border-amber-200 dark:hover:border-amber-900/50 transition-colors">
            <div className="bg-amber-100 dark:bg-amber-900/40 w-14 h-14 rounded-2xl flex items-center justify-center mb-6">
              <FlaskConical className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h4 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">The Entourage Effect</h4>
            <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-sm">
              Minor cannabinoids and aromatic terpenes work synergistically to enhance or modulate the effects of THC and CBD.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-3xl p-8 border border-neutral-200 dark:border-neutral-700 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-colors">
            <div className="bg-indigo-100 dark:bg-indigo-900/40 w-14 h-14 rounded-2xl flex items-center justify-center mb-6">
              <Stethoscope className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h4 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">Clinical Evidence</h4>
            <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-sm">
              Our recommendations are anchored in peer-reviewed data, mapping specific profiles to neuropathic pain, insomnia, and anxiety.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
