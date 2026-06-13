import { permissionsForRole } from "@/lib/rbac/permissions";
import { STAFF_ROLES } from "@/lib/rbac/team-management";
import { RoleMatrixTable, type RoleMatrixRow } from "./role-matrix-table";

// A curated, scannable slice of the full permission matrix. The point the
// audit insists on — "clinical authoring/signing is a permission, not a
// default" — is the "Author & sign notes" column: every non-clinical role
// reads as "—" there. Values are computed from `permissionsForRole`, the
// same source enforcement uses, so this viewer can never drift from reality.

export function RoleMatrix() {
  const rows: RoleMatrixRow[] = STAFF_ROLES.map((meta) => {
    const granted = new Set(permissionsForRole(meta.role));
    return {
      id: meta.role,
      role: meta.label,
      demographics: granted.has("patient.demographics.edit"),
      billing: granted.has("billing.edit"),
      readNotes: granted.has("notes.read"),
      authorSignNotes: granted.has("notes.edit"),
      prescribe: granted.has("prescriptions.write"),
      sensitiveDx: granted.has("sensitive_diagnoses.read"),
      chartPrivacy: granted.has("chart.privacy.manage"),
    };
  });

  return (
    <div>
      <h2 className="text-base font-semibold text-text mb-1">
        What each role can do
      </h2>
      <p className="text-sm text-text-muted mb-4">
        Read-only reference, computed from the live permission matrix.
        Clinical authoring and signing are gated permissions — only Provider
        and Owner-as-provider roles carry them.
      </p>
      <RoleMatrixTable rows={rows} />
    </div>
  );
}
