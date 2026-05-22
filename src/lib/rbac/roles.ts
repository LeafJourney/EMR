import type { Role } from "@prisma/client";

/** Role labels for UI display. */
export const ROLE_LABELS: Record<Role, string> = {
  patient: "Patient",
  clinician: "Clinician",
  midlevel: "Mid-Level Provider",
  back_office: "Back Office",
  front_office: "Front Office",
  operator: "Operator",
  practice_owner: "Practice Owner",
  practice_admin: "Practice Admin",
  implementation_admin: "Implementation Admin",
  super_admin: "Super Admin",
  system: "System",
};

/** Which landing path each role should hit after login. */
export const ROLE_HOME: Record<Role, string> = {
  patient: "/portal",
  clinician: "/clinic",
  midlevel: "/clinic",
  back_office: "/clinic",
  front_office: "/clinic",
  operator: "/ops",
  practice_owner: "/ops",
  practice_admin: "/ops",
  implementation_admin: "/onboarding",
  super_admin: "/onboarding",
  system: "/ops/mission-control",
};

/**
 * Roles allowed to enter each route prefix. First match wins.
 *
 * EMR-786 — Office roles (front_office, back_office) and midlevel
 * providers are scoped to /clinic just like clinicians; the finer-grained
 * permission model in `permissions.ts` decides what they can see/do once
 * inside.
 */
const ROUTE_GUARDS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/portal", roles: ["patient"] },
  {
    prefix: "/clinic",
    roles: [
      "clinician",
      "midlevel",
      "back_office",
      "front_office",
      "practice_owner",
    ],
  },
  {
    prefix: "/ops",
    roles: ["operator", "practice_owner", "practice_admin", "system"],
  },
  // EMR-428: onboarding controller — Super Admin / Implementation Admin only.
  { prefix: "/onboarding/wizard", roles: ["super_admin", "implementation_admin"] },
  { prefix: "/templates", roles: ["super_admin", "implementation_admin"] },
];

/** Does this role have any permission to access this path prefix? */
export function canAccessPath(role: Role, path: string): boolean {
  for (const guard of ROUTE_GUARDS) {
    if (path.startsWith(guard.prefix)) {
      return guard.roles.includes(role);
    }
  }
  return true; // unguarded paths are public
}

/** The highest-privilege role from a set — used to pick the primary experience. */
export function primaryRole(roles: Role[]): Role {
  const order: Role[] = [
    "super_admin",
    "implementation_admin",
    "system",
    "practice_owner",
    "practice_admin",
    "operator",
    "clinician",
    "midlevel",
    "back_office",
    "front_office",
    "patient",
  ];
  for (const r of order) if (roles.includes(r)) return r;
  return "patient";
}
