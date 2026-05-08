import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Platform Disclaimer (EMR-027)
 * Displays a persistent disclaimer regarding the use of cannabis as medicine.
 */
export function PlatformDisclaimer() {
  return (
    <div className="w-full bg-emerald-900/10 border-t border-emerald-900/20 py-4 px-6 text-center">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-emerald-800 dark:text-emerald-300">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
        <p className="leading-relaxed">
          <span className="font-semibold">Disclaimer:</span> Cannabis should be
          considered a medicine so please use it carefully and judiciously. Do
          not abuse Cannabis and please respect the plant and its healing
          properties.
        </p>
      </div>
    </div>
  );
}
