"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DrugMixChecker } from "./DrugMixChecker";

/**
 * Embedded /education tab variant of the Drug Mix module. The same
 * `DrugMixChecker` powers the standalone /education/drug-mix page (EMR-617),
 * so the form/results/parsing logic stays in lockstep.
 */
export function DrugMixTab() {
  return (
    <>
      <DrugMixChecker />
      <div className="max-w-3xl mx-auto mt-8 px-4 sm:px-0 text-center">
        <Link
          href="/education/drug-mix"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
        >
          Open Drug Mix in its own page
          <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
