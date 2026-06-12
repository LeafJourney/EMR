"use client";

// Patient cohort table, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5) and the table can be downloaded or
// printed (G6). Rows are plain text/numbers with one Badge for suppressed ZIP3.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export interface PatientCohortRow {
  pseudonym: string;
  ageDisplay: string;
  ageNum: number;
  sex: string;
  race: string;
  ethnicity: string;
  smokingStatus: string;
  zipPrefix: string;
  zipSuppressed: boolean;
  socioeconomicTier: string;
}

export function PatientCohortTable({ rows }: { rows: PatientCohortRow[] }) {
  const columns: ColumnDef<PatientCohortRow>[] = [
    { key: "pseudonym", label: "Pseudonym", sortable: true },
    {
      key: "age",
      label: "Age",
      sortable: true,
      align: "right",
      cell: (r) => r.ageDisplay,
      sortFn: (a, b) => a.ageNum - b.ageNum,
      exportValue: (r) => r.ageDisplay,
    },
    { key: "sex", label: "Sex", sortable: true },
    { key: "race", label: "Race", sortable: true },
    { key: "ethnicity", label: "Ethnicity", sortable: true },
    { key: "smokingStatus", label: "Smoking", sortable: true },
    {
      key: "zipPrefix",
      label: "ZIP3",
      sortable: true,
      cell: (r) =>
        r.zipSuppressed ? (
          <Badge tone="warning">000</Badge>
        ) : (
          r.zipPrefix
        ),
      exportValue: (r) => r.zipPrefix,
    },
    { key: "socioeconomicTier", label: "SES", sortable: true },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.pseudonym}
      ariaLabel="Patient cohort (de-identified)"
      exportable
      exportName="research-exports-patients"
      emptyState={
        <EmptyState
          title="All buckets suppressed"
          description="Lower the minimum cell size to view the cohort."
        />
      }
    />
  );
}
