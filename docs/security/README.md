# Route auth manifest + admin-mutation coverage

This directory is the single source of truth for `/api/**` auth posture
and rate-limit coverage. Two CI gates run against the files here:

| File                                                | Enforced by                                       |
| --------------------------------------------------- | ------------------------------------------------- |
| `docs/security/route-auth.yaml`                     | `scripts/check-route-auth-manifest.mjs`           |
| `src/app/api/admin/**`, `src/app/api/configs/**`    | `scripts/check-admin-mutation-coverage.mjs` (EMR-728) |

Both run in `.github/workflows/route-auth-manifest.yml` on every PR.

## Adding a new admin / controller mutation route

Every `POST | PATCH | DELETE` handler under `src/app/api/admin/**` or
`src/app/api/configs/**` MUST be wrapped by `withAdminMutation` from
`src/lib/auth/with-admin-mutation.ts`. The helper composes:

- `requireApiAuth({ role, rateLimit: { limiter: adminMutationLimiter, bucket } })`
- `logControllerAction({ action: "controller.<bucket>.<ok|denied|error>", ... })` on every outcome

### 1. Wrap the handler

```ts
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";

export const POST = withAdminMutation<{ id: string }>(
  { bucket: "admin.config.publish", role: "implementation_admin" },
  async (req, { actor, params }) => {
    // ... business logic. Throw or return a Response. The wrapper
    // turns any throw into a 500 with a structured error row.
  },
);
```

Notes:

- `role` defaults to `"super_admin"`. Pass `"implementation_admin"` to
  accept the controller-write union (super_admin ∪ implementation_admin),
  matching `requireImplementationAdmin` semantics.
- `bucket` names the resource being mutated — e.g.
  `admin.super_admin.grant`, `admin.config.archive`. Keep it
  dot-namespaced; metrics + audit rows filter on the prefix.
- The wrapper preserves the Next.js `{ params }` second-arg shape, so
  dynamic-route segment params arrive in `ctx.params` unchanged.

### 2. Add a manifest entry

Open `docs/security/route-auth.yaml` and add:

```yaml
admin/<your-resource>:
  methods: [POST]
  auth: required
  owner: <your-team>
  notes: "<who/why>. Wrapped by withAdminMutation (EMR-728)."
  rate_limit_bucket: admin.<your-resource>.<verb>
```

The `rate_limit_bucket` field is informational; the helper-wrap check
walks the route source directly, so coverage is enforced even if the
manifest entry is forgotten — and vice versa, the manifest gate fails
if a new route lands without an entry.

### 3. Verify locally

```sh
node scripts/check-route-auth-manifest.mjs
node scripts/check-admin-mutation-coverage.mjs
npm run typecheck
```

All three must pass before pushing. If `check-admin-mutation-coverage`
fails, it names the offending file and verb — convert the handler to
the `withAdminMutation` form above and re-run.

## Why a separate helper, not just calling `requireApiAuth` directly?

The helper is the single chokepoint for rate-limit + audit parity. Five
routes today use `adminMutationLimiter` via per-route plumbing; ~15
more controller routes land in EMR-407..EMR-479 (Practice Onboarding
Controller v1). Each individual route remembering to wire both the
limiter AND `logControllerAction` is a code-review game that loses
eventually. The helper makes the safe path the default — handlers
declare intent (bucket name + business logic) and nothing else.
