import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Permission, permissionsForRole } from "@/lib/rbac/permissions";
import { STAFF_ROLES } from "@/lib/rbac/team-management";

// A curated, scannable slice of the full permission matrix. The point the
// audit insists on — "clinical authoring/signing is a permission, not a
// default" — is the "Author & sign notes" column: every non-clinical role
// reads as "—" there. Values are computed from `permissionsForRole`, the
// same source enforcement uses, so this viewer can never drift from reality.
const COLUMNS: Array<{ label: string; permission: Permission }> = [
  { label: "Demographics", permission: "patient.demographics.edit" },
  { label: "Billing", permission: "billing.edit" },
  { label: "Read notes", permission: "notes.read" },
  { label: "Author & sign notes", permission: "notes.edit" },
  { label: "Prescribe", permission: "prescriptions.write" },
  { label: "Sensitive dx", permission: "sensitive_diagnoses.read" },
  { label: "Chart privacy", permission: "chart.privacy.manage" },
];

export function RoleMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What each role can do</CardTitle>
        <CardDescription>
          Read-only reference, computed from the live permission matrix.
          Clinical authoring and signing are gated permissions — only Provider
          and Owner-as-provider roles carry them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left">
                <th className="py-2 pr-4 font-medium text-text-muted">Role</th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.permission}
                    className="px-3 py-2 text-center font-medium text-text-muted whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAFF_ROLES.map((meta) => {
                const granted = new Set(permissionsForRole(meta.role));
                return (
                  <tr key={meta.role} className="border-b border-border/40">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-text">{meta.label}</span>
                    </td>
                    {COLUMNS.map((col) => {
                      const has = granted.has(col.permission);
                      return (
                        <td key={col.permission} className="px-3 py-2.5 text-center">
                          {has ? (
                            <span className="text-accent" aria-label="yes">✓</span>
                          ) : (
                            <span className="text-text-muted/40" aria-label="no">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
