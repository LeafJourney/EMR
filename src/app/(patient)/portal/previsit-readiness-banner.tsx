// EMR-914 — patient-portal "Get ready for your visit" banner.
//
// Reads the CANONICAL readiness SoT for the patient's next appointment and, when
// blocking items remain, surfaces them as a tappable checklist deep-linked via
// the gate's own resolveHref. Renders NOTHING when there's no upcoming visit or
// the patient is already ready — no dashboard noise. Server component: it fetches
// its own data from the patient id the page already resolved.

import Link from "next/link";

import { getNextAppointmentReadinessForPatient } from "@/lib/scheduling/previsit-readiness";
import { Card, CardContent } from "@/components/ui/card";
import { buildPrevisitBannerView } from "./previsit-banner-view";

export async function PrevisitReadinessBanner({ patientId }: { patientId: string }) {
  const view = await getNextAppointmentReadinessForPatient(patientId, new Date());
  const banner = buildPrevisitBannerView(view, new Date());
  if (!banner) return null;

  const remaining = banner.items.length;

  return (
    <Card tone="glass" className="mb-6">
      <CardContent className="py-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
            Get ready for your visit
          </p>
          <span className="text-[11px] font-medium text-text-subtle">
            {banner.completionPct}% ready
          </span>
        </div>

        <h2 className="font-display text-xl text-text tracking-tight mb-1">
          Your visit is {banner.whenLabel}
        </h2>
        <p className="text-sm text-text-muted mb-4 leading-relaxed">
          {remaining === 1
            ? "There's 1 thing to finish so your care team is ready for you."
            : `There are ${remaining} things to finish so your care team is ready for you.`}
        </p>

        <div className="relative h-2 bg-surface-muted rounded-full overflow-hidden mb-5">
          <div
            className="h-full bg-gradient-to-r from-accent to-[#3A8560] transition-all"
            style={{ width: `${banner.completionPct}%` }}
          />
        </div>

        <ul className="space-y-2">
          {banner.items.map((item) => {
            const label = (
              <span className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-4 py-3">
                <span className="text-[15px] font-medium text-text">{item.label}</span>
                <span aria-hidden="true" className="text-text-subtle">
                  ›
                </span>
              </span>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="block transition-all hover:opacity-80">
                    {label}
                  </Link>
                ) : (
                  label
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
