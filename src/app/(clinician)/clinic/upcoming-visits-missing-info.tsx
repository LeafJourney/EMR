// EMR-914 — clinician dashboard widget: upcoming visits still missing intake.
// Server component; fetches its own org-scoped data. Renders the SoT-derived
// list (who / what's missing / how soon), each row deep-linking to the patient's
// pre-visit prepare page.

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { loadUpcomingVisitsMissingInfo } from "./upcoming-readiness";

export async function UpcomingVisitsMissingInfo({
  organizationId,
}: {
  organizationId: string;
}) {
  const rows = await loadUpcomingVisitsMissingInfo(organizationId, new Date());

  return (
    <Card tone="default">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="h-2 w-2 rounded-full bg-highlight" aria-hidden="true" />
          Upcoming visits with missing info
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">
            All upcoming visits are ready.
          </p>
        ) : (
          <ul className="space-y-1 -mx-2">
            {rows.map((row) => (
              <li key={row.appointmentId}>
                <Link
                  href={`/clinic/patients/${row.patientId}/prepare`}
                  className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-surface-muted/50 transition-colors group"
                >
                  <Avatar firstName={row.firstName} lastName={row.lastName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text truncate group-hover:text-accent transition-colors">
                        {row.firstName} {row.lastName}
                      </p>
                      <Badge tone="warning">{row.whenLabel}</Badge>
                    </div>
                    <p className="text-[11px] text-text-subtle mt-0.5 truncate">
                      {row.outstandingCount} missing · {row.missingLabels.join(" · ")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
