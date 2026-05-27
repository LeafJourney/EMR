# Commercial App Hardening Design

Date: 2026-05-27

## Context

The signed-in Leafjourney experience currently feels unstable in two visible ways:

- Some recovery actions send authenticated users to `/`, which is the public marketing landing page. For a patient, clinician, or operator, that reads like being kicked out of the product.
- Some command-palette actions point to routes that are not present in `src/app`, producing dead ends instead of reliable work surfaces.

The main workspace also contains many unrelated in-progress edits, so this work is done in an isolated worktree on `hardening/commercial-app-stability`.

## Goal

Make the authenticated commercial app feel dependable by hardening signed-in navigation, error recovery, and route integrity for the patient portal, clinician clinic, and operator ops surfaces.

## Scope

In scope:

- Patient portal, clinician clinic, and operator ops route groups.
- Error and not-found recovery links that appear inside authenticated contexts.
- Command palette routes for authenticated roles.
- Role redirect logic that chooses a user's signed-in home.
- Automated tests that catch missing authenticated navigation targets before they ship.

Out of scope:

- Public marketing pages.
- Leafmart storefront and marketplace polish.
- Full click-crawler coverage of every authenticated interactive element.
- New product features or broad UI redesign.

## Approach

Use a stability rail rather than a one-off patch:

1. Route recovery actions inside authenticated contexts to role-appropriate homes:
   - patient: `/portal`
   - clinician and clinic-floor roles: `/clinic`
   - operator, practice owner, practice admin, and system roles: `/ops`
2. Replace missing command-palette routes with existing surfaces or remove commands where no equivalent exists.
3. Export authenticated navigation definitions from the layouts into small route modules so tests can inspect them without rendering server components.
4. Add a route-integrity test that compares signed-in nav and command-palette hrefs against actual `src/app/**/page.tsx` routes, including dynamic segments.
5. Keep changes tightly scoped and avoid touching unrelated dirty files from the main workspace.

## Expected Route Corrections

Known command-palette misses from the initial scan:

- `/clinic/queue` -> `/clinic`
- `/clinic/settings` -> `/settings/preferences`
- `/clinic/labs-review` -> `/clinic/sign-off/labs`
- `/clinic/refills` -> `/clinic/sign-off/refills`
- `/ops/messages?action=compose` -> `/clinic/messages?action=compose`
- `/ops/settings` -> `/ops/settings/ai-config`

Known authenticated recovery misses:

- `src/app/(patient)/portal/error.tsx` uses `window.location.href = "/"`; route it to `/portal`.
- `src/app/(clinician)/clinic/error.tsx` uses `window.location.href = "/"`; route it to `/clinic`.
- Root and global error screens should avoid claiming "Go home" when the destination is public marketing; label the public fallback clearly or route through `/post-sign-in` when safe.

## Testing

Add focused tests before implementation changes:

- A command-palette route test that fails on the six known missing hrefs.
- A signed-in recovery route test that fails if authenticated error pages link or assign to `/`.
- A navigation route-integrity test that validates exported patient, clinician, and operator nav hrefs against actual app routes.
- A role redirect test for primary-role fallback in patient/operator layouts where arbitrary `user.roles[0]` is still used.

Verification commands:

- `npm run test -- src/components/ui/command-palette.test.tsx src/components/shell/authenticated-route-integrity.test.ts src/lib/rbac/roles.test.ts`
- `npm run typecheck`

If the full typecheck is blocked by unrelated baseline issues, capture the failure and run the focused tests as the completion gate for this slice.

## Success Criteria

- No authenticated recovery action sends the user to public `/` as a "home" action.
- All authenticated command-palette hrefs resolve to actual app routes.
- Authenticated nav definitions can be validated by automated tests.
- Multi-role redirects use `primaryRole()` instead of role array order in the touched layouts.
- Focused tests pass and typecheck is run or its unrelated blocker is documented.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: the design is limited to signed-in commercial stability and does not include public or storefront polish.
- Consistency check: route corrections match the existing app route tree.
- Ambiguity check: `/` is allowed only as a clearly public fallback, not as authenticated "home".
